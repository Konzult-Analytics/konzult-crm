"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { saLocalToIso } from "@/lib/crm/dates";
import {
  fields,
  optionalDate,
  optionalEnum,
  optionalText,
  optionalUuid,
  type FormState,
} from "@/lib/crm/forms";
import { keysOf, MEETING_PURPOSES, MEETING_SETTINGS, OUTCOMES, TOUCH_TYPES } from "@/lib/crm/labels";
import { personName } from "@/lib/crm/people";
import { advanceFor, isTrack } from "@/lib/crm/stages";

const touchSchema = z.object({
  person_id: z.uuid(),
  journey_id: optionalUuid,
  campaign_id: optionalUuid,
  type: z.enum(keysOf(TOUCH_TYPES)),
  direction: optionalEnum(["out", "in"]),
  outcome: optionalEnum(keysOf(OUTCOMES)),
  occurred_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  summary: optionalText(10000),
  next_step: optionalText(500),
  follow_up_on: optionalDate,
  meeting_purpose: optionalEnum(keysOf(MEETING_PURPOSES)),
  meeting_setting: optionalEnum(keysOf(MEETING_SETTINGS)),
  booking_id: optionalUuid,
});

export async function logTouch(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  const parsed = touchSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "Pick who it was with and what kind of touch it was." };
  const t = parsed.data;

  const isMessage = t.type !== "meeting" && t.type !== "note";
  const isMeeting = t.type === "meeting";

  const { data: person } = await supabase
    .from("people")
    .select("id, first_name, last_name, organisation_id")
    .eq("id", t.person_id)
    .maybeSingle();
  if (!person) return { error: "That person no longer exists." };

  const { data: journey } = t.journey_id
    ? await supabase.from("journeys").select("id, track, stage, status").eq("id", t.journey_id).maybeSingle()
    : { data: null };

  const { data: touch, error } = await supabase
    .from("interactions")
    .insert({
      type: t.type,
      direction: isMessage ? (t.direction ?? "out") : null,
      outcome: t.type === "note" ? null : t.outcome,
      occurred_at: saLocalToIso(t.occurred_at),
      summary: t.summary,
      next_step: t.next_step,
      journey_id: journey?.id ?? null,
      campaign_id: t.campaign_id,
      organisation_id: person.organisation_id,
      meeting_purpose: isMeeting ? t.meeting_purpose : null,
      meeting_setting: isMeeting ? t.meeting_setting : null,
    })
    .select("id, type, direction, outcome")
    .single();
  if (error || !touch) {
    console.error("log touch failed", error);
    return { error: "Couldn't log this touch. Try again." };
  }

  const { error: linkError } = await supabase
    .from("interaction_people")
    .insert({ interaction_id: touch.id, person_id: person.id });
  if (linkError) {
    console.error("link touch failed", linkError);
    await supabase.from("interactions").delete().eq("id", touch.id);
    return { error: "Couldn't log this touch. Try again." };
  }

  if (journey?.status === "open" && isTrack(journey.track)) {
    const next = advanceFor(journey.track, journey.stage, touch);
    if (next) {
      const { error: moveError } = await supabase.from("journeys").update({ stage: next }).eq("id", journey.id);
      if (moveError) console.error("advance stage failed", moveError);
    }
  }

  // Logged from "How did it go?": the booked meeting happened.
  if (t.booking_id && isMeeting) {
    const { error: bookingError } = await supabase
      .from("bookings")
      .update({ outcome: "held", outcome_at: new Date().toISOString() })
      .eq("id", t.booking_id)
      .eq("person_id", person.id)
      .eq("status", "booked");
    if (bookingError) console.error("mark booking held failed", bookingError);
  }

  if (t.follow_up_on) {
    const { error: taskError } = await supabase.from("tasks").insert({
      title: `Follow up with ${personName(person)}`,
      kind: "follow_up",
      due_on: t.follow_up_on,
      person_id: person.id,
      journey_id: journey?.id ?? null,
    });
    if (taskError) console.error("follow-up task failed", taskError);
  }

  revalidatePath("/", "layout");
  redirect(`/people/${person.id}?logged=1`);
}
