"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type Enrollment = { factorId: string; qrCode: string; secret: string };
export type EnrollState = { enrollment?: Enrollment; error?: string } | null;
export type CodeState = { error: string } | null;

const codeSchema = z.string().trim().regex(/^\d{6}$/);
const factorIdSchema = z.string().uuid();

const BAD_CODE = "That code didn't work. Codes change every 30 seconds, so enter the current one.";

/** Signed-in sessions that have not passed two-factor yet; anything else is sent on. */
async function preMfaSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/");
  return { supabase, hasVerifiedFactor: aal?.nextLevel === "aal2" };
}

export async function startEnrollment(): Promise<EnrollState> {
  const { supabase, hasVerifiedFactor } = await preMfaSession();
  if (hasVerifiedFactor) redirect("/mfa/verify");

  // A reload or abandoned attempt leaves unverified factors behind; clear them
  // so the new one doesn't collide.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Authenticator app",
    issuer: "Konzult CRM",
  });
  if (error || !data) {
    console.error("mfa enroll failed", error);
    return { error: "Couldn't start two-factor set-up. Try again." };
  }
  return { enrollment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } };
}

export async function confirmEnrollment(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const { supabase } = await preMfaSession();
  const factorId = factorIdSchema.safeParse(formData.get("factorId"));
  const code = codeSchema.safeParse(formData.get("code"));
  if (!factorId.success) return { error: "Set-up expired. Reload the page and start again." };
  if (!code.success) return { error: "Enter the 6-digit code from your authenticator app." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factorId.data,
    code: code.data,
  });
  if (error) return { error: BAD_CODE };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function verifyCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const { supabase, hasVerifiedFactor } = await preMfaSession();
  if (!hasVerifiedFactor) redirect("/mfa/enroll");

  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: "Enter the 6-digit code from your authenticator app." };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (!factor) redirect("/mfa/enroll");

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: code.data,
  });
  if (error) return { error: BAD_CODE };

  revalidatePath("/", "layout");
  redirect("/");
}
