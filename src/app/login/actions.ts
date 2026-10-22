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
    return { error: "Login failed. Check your email and password." };
  }

  revalidatePath("/", "layout");
  // The proxy sends the session on to two-factor set-up or verification.
  redirect("/");
}
