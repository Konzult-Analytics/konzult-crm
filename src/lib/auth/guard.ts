import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side check for pages behind login. The proxy already redirects, but
 * pages must not rely on it alone (Next.js data-security guidance).
 */
export async function requireMfaSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    redirect(aal?.nextLevel === "aal2" ? "/mfa/verify" : "/mfa/enroll");
  }

  return { supabase, user };
}
