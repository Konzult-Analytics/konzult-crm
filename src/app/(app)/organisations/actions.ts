"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { fields, optionalEnum, optionalText, requiredText, type FormState } from "@/lib/crm/forms";
import { keysOf, SIZE_BANDS, TURNOVER_BANDS } from "@/lib/crm/labels";

const organisationSchema = z.object({
  name: requiredText(160),
  industry: optionalText(120),
  city: optionalText(120),
  website: optionalText(300),
  size_band: optionalEnum(keysOf(SIZE_BANDS)),
  turnover_band: optionalEnum(keysOf(TURNOVER_BANDS)),
  notes: optionalText(5000),
});

function saveError(error: { code?: string } | null, action: string): FormState {
  if (error?.code === "23505") return { error: "An organisation with that name already exists." };
  console.error(`${action} organisation failed`, error);
  return { error: "Couldn't save the organisation. Try again." };
}

export async function createOrganisation(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  const parsed = organisationSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "An organisation needs a name." };

  const { data, error } = await supabase.from("organisations").insert(parsed.data).select("id").single();
  if (error || !data) return saveError(error, "create");

  revalidatePath("/", "layout");
  redirect(`/organisations/${data.id}`);
}

export async function updateOrganisation(
  organisationId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  const parsed = organisationSchema.safeParse(fields(formData));
  if (!parsed.success || !z.uuid().safeParse(organisationId).success) return { error: "An organisation needs a name." };

  const { error } = await supabase.from("organisations").update(parsed.data).eq("id", organisationId);
  if (error) return saveError(error, "update");

  revalidatePath("/", "layout");
  return null;
}
