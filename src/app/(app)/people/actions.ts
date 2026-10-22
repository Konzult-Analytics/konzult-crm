"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import type { Database } from "@/lib/supabase/database.types";
import { findOrCreateOrganisation } from "@/lib/crm/organisations";
import {
  checkbox,
  fields,
  optionalDate,
  optionalEmail,
  optionalText,
  optionalUuid,
  requiredText,
  type FormState,
} from "@/lib/crm/forms";

const personSchema = z.object({
  first_name: requiredText(80),
  last_name: optionalText(80),
  email: optionalEmail,
  phone: optionalText(40),
  role_title: optionalText(120),
  organisation: optionalText(160),
  bni_chapter: optionalText(80),
  is_bni_member: checkbox,
  birthday: optionalDate,
  notes: optionalText(5000),
});

const journeySchema = z.object({
  track: z.enum(["client", "partner"]),
  source_id: optionalUuid,
  referred_by_person_id: optionalUuid,
});

const INVALID_PERSON = "Check the form: a first name is required, and the email and birthday must be valid.";

type PersonInsert = Database["public"]["Tables"]["people"]["Insert"];

async function personRow(
  supabase: Awaited<ReturnType<typeof requireMfaSession>>["supabase"],
  formData: FormData
): Promise<{ error: string } | { row: PersonInsert }> {
  const parsed = personSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: INVALID_PERSON };
  const { organisation, ...rest } = parsed.data;
  const organisation_id = organisation ? await findOrCreateOrganisation(supabase, organisation) : null;
  if (organisation && !organisation_id) return { error: "Couldn't save the organisation. Try again." };
  return { row: { ...rest, organisation_id } };
}

export async function createPerson(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  const person = await personRow(supabase, formData);
  if ("error" in person) return { error: person.error };

  const values = fields(formData);
  const journey = values.track === "none" ? null : journeySchema.safeParse(values);
  if (journey && !journey.success) return { error: "Choose a valid track and source for the journey." };

  const { data, error } = await supabase.from("people").insert(person.row).select("id").single();
  if (error || !data) {
    console.error("create person failed", error);
    return { error: "Couldn't save this person. Try again." };
  }

  let notice = "";
  if (journey?.success) {
    const { error: journeyError } = await supabase.from("journeys").insert({ ...journey.data, person_id: data.id });
    if (journeyError) {
      console.error("start journey failed", journeyError);
      notice = "?notice=journey-failed";
    }
  }

  revalidatePath("/", "layout");
  redirect(`/people/${data.id}${notice}`);
}

export async function updatePerson(personId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  if (!z.uuid().safeParse(personId).success) return { error: "That person no longer exists." };
  const person = await personRow(supabase, formData);
  if ("error" in person) return { error: person.error };

  const { error } = await supabase.from("people").update(person.row).eq("id", personId);
  if (error) {
    console.error("update person failed", error);
    return { error: "Couldn't save the changes. Try again." };
  }

  revalidatePath("/", "layout");
  redirect(`/people/${personId}`);
}

const consentSchema = z.object({
  marketing_consent: z.enum(["unknown", "granted", "refused"]),
  marketing_consent_note: optionalText(500),
});

/** POPIA s69: record whether this person agreed to electronic marketing, and how. */
export async function setConsent(personId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireMfaSession();
  const parsed = consentSchema.safeParse(fields(formData));
  if (!parsed.success || !z.uuid().safeParse(personId).success) return;
  const { marketing_consent, marketing_consent_note } = parsed.data;
  const { error } = await supabase
    .from("people")
    .update({
      marketing_consent,
      marketing_consent_note: marketing_consent === "unknown" ? null : marketing_consent_note,
      marketing_consent_at: marketing_consent === "unknown" ? null : new Date().toISOString(),
    })
    .eq("id", personId);
  if (error) console.error("set consent failed", error);
  revalidatePath(`/people/${personId}`);
}

export async function startJourney(personId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  const parsed = journeySchema.safeParse(fields(formData));
  if (!parsed.success || !z.uuid().safeParse(personId).success) return { error: "Choose a track to start." };

  const { data: open } = await supabase
    .from("journeys")
    .select("id")
    .eq("person_id", personId)
    .eq("track", parsed.data.track)
    .neq("status", "lost")
    .limit(1);
  if (open?.length) return { error: `There's already a ${parsed.data.track} journey for this person.` };

  const { error } = await supabase.from("journeys").insert({ ...parsed.data, person_id: personId });
  if (error) {
    console.error("start journey failed", error);
    return { error: "Couldn't start the journey. Try again." };
  }

  revalidatePath("/", "layout");
  return null;
}
