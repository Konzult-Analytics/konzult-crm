"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { checkbox, fields, optionalText, requiredText, type FormState } from "@/lib/crm/forms";
import { keysOf } from "@/lib/crm/labels";
import { PURPOSES } from "@/lib/crm/messages";

const templateSchema = z.object({
  name: requiredText(80),
  purpose: z.enum(keysOf(PURPOSES)),
  subject: optionalText(200),
  body: requiredText(4000),
  active: checkbox,
});

/** Creates a template (templateId null) or saves changes to one. */
export async function saveTemplate(templateId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  if (templateId !== null && !z.uuid().safeParse(templateId).success) return { error: "That template no longer exists." };
  const parsed = templateSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "A template needs a name and a message (up to 4,000 characters)." };

  const { error } = templateId
    ? await supabase.from("templates").update(parsed.data).eq("id", templateId)
    : await supabase.from("templates").insert({ ...parsed.data, sort_order: 100 });
  if (error) {
    console.error("save template failed", error);
    return { error: error.code === "23505" ? "There's already a template with that name." : "Couldn't save the template. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}
