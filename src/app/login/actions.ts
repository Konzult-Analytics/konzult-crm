"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(72),
});

// Attempt limits come from Supabase Auth, which every sign-in passes through.
export async function login(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and a password of at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // The reason stays server-side; the screen gets one generic message.
    console.error("login refused", { code: error.code, status: error.status });
    return { error: "Login failed. Check your email and password." };
  }

  // Straight to the two-factor step, so the address bar matches the page.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  revalidatePath("/", "layout");
  redirect(aal?.nextLevel === "aal2" ? "/mfa/verify" : "/mfa/enroll");
}
