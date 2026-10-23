"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { saDate } from "@/lib/crm/dates";
import { fields, optionalDate, optionalEnum, optionalText, type FormState } from "@/lib/crm/forms";
import { CLIENT_STATUSES, REFERRAL_STATUSES, TESTIMONIAL_STATUSES, keysOf } from "@/lib/crm/labels";
import { isStage, isTrack } from "@/lib/crm/stages";

async function loadJourney(journeyId: string) {
  const { supabase } = await requireMfaSession();
  if (!z.uuid().safeParse(journeyId).success) return { supabase, journey: null };
  const { data: journey } = await supabase
    .from("journeys")
    .select("id, track, stage, status")
    .eq("id", journeyId)
    .maybeSingle();
  return { supabase, journey };
}

export async function moveStage(journeyId: string, stage: string): Promise<FormState> {
  const { supabase, journey } = await loadJourney(journeyId);
  if (!journey || !isTrack(journey.track) || !isStage(journey.track, stage)) {
    return { error: "That move isn't possible." };
  }
  if (journey.status !== "open") return { error: "Reopen this journey before moving it." };
  if (journey.stage === stage) return null;

  const { error } = await supabase.from("journeys").update({ stage }).eq("id", journeyId);
  if (error) {
    console.error("move stage failed", error);
    return { error: "Couldn't move the journey. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}

const closeSchema = z.object({
  status: z.enum(["lost", "parked"]),
  exit_reason_id: z.uuid(),
  parked_until: optionalDate,
  exit_note: optionalText(2000),
});

export async function closeJourney(journeyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, journey } = await loadJourney(journeyId);
  if (!journey) return { error: "That journey no longer exists." };
  const parsed = closeSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "Pick a reason. Nothing closes without one." };
  const { status, exit_reason_id, parked_until, exit_note } = parsed.data;
  if (status === "parked" && (!parked_until || parked_until <= saDate())) {
    return { error: "Pick a revisit date after today." };
  }

  const { error } = await supabase
    .from("journeys")
    .update({
      status,
      exit_reason_id,
      exit_note,
      exit_stage: journey.stage,
      closed_at: new Date().toISOString(),
      parked_until: status === "parked" ? parked_until : null,
    })
    .eq("id", journeyId);
  if (error) {
    console.error("close journey failed", error);
    return { error: "Couldn't close the journey. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}

/** From Today's "no reply after 3 tries": close as Never responded in one tap. */
export async function closeNeverResponded(formData: FormData): Promise<void> {
  const journeyId = String(formData.get("journey_id") ?? "");
  const { supabase, journey } = await loadJourney(journeyId);
  if (!journey || journey.status !== "open") return;
  const { data: reason } = await supabase
    .from("exit_reasons")
    .select("id")
    .eq("label", "Never responded")
    .maybeSingle();
  if (!reason) {
    console.error("never-responded reason missing");
    return;
  }
  const { error } = await supabase
    .from("journeys")
    .update({
      status: "lost",
      exit_reason_id: reason.id,
      exit_stage: journey.stage,
      closed_at: new Date().toISOString(),
      exit_note: "Closed from Today after 3 unanswered messages",
    })
    .eq("id", journeyId);
  if (error) console.error("close never-responded failed", error);
  revalidatePath("/", "layout");
}

// An unanswered question isn't submitted at all, so every answer is optional.
const fitAnswer = z
  .union([z.literal(""), z.enum(["yes", "maybe", "no"])])
  .optional()
  .transform((v) => v || null);

const optionalNumber = (max: number, integer: boolean) =>
  z
    .union([z.literal(""), z.coerce.number().min(0).max(max)])
    .optional()
    .refine((v) => v === undefined || v === "" || !integer || Number.isInteger(v))
    .transform((v) => (v === undefined || v === "" ? null : Math.round(v * 100) / 100));

const fitSchema = z.object({
  fit_need: fitAnswer,
  fit_timing: fitAnswer,
  fit_budget: fitAnswer,
  fit_decision: fitAnswer,
  chance_pct: optionalNumber(100, true),
  value_estimate: optionalNumber(100_000_000, false),
});

export async function saveFit(journeyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, journey } = await loadJourney(journeyId);
  if (!journey) return { error: "That journey no longer exists." };
  const parsed = fitSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "Chance must be 0–100 and the value a positive number." };

  const { error } = await supabase.from("journeys").update(parsed.data).eq("id", journeyId);
  if (error) {
    console.error("save fit failed", error);
    return { error: "Couldn't save the fit check. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}

const careSchema = z.object({
  client_status: z.enum(keysOf(CLIENT_STATUSES)),
  testimonial_status: optionalEnum(keysOf(TESTIMONIAL_STATUSES)),
  testimonial_quote: optionalText(2000),
  referral_status: optionalEnum(keysOf(REFERRAL_STATUSES)),
});

export async function saveClientCare(journeyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, journey } = await loadJourney(journeyId);
  if (!journey || journey.track !== "client" || journey.stage !== "client") {
    return { error: "Client care is for won clients only." };
  }
  const parsed = careSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "Pick a status. A testimonial can be up to 2,000 characters." };

  const { error } = await supabase.from("journeys").update(parsed.data).eq("id", journeyId);
  if (error) {
    console.error("save client care failed", error);
    return { error: "Couldn't save. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}

export async function reopenJourney(journeyId: string): Promise<FormState> {
  const { supabase, journey } = await loadJourney(journeyId);
  if (!journey) return { error: "That journey no longer exists." };

  const { error } = await supabase
    .from("journeys")
    .update({ status: "open", exit_reason_id: null, exit_stage: null, exit_note: null, closed_at: null, parked_until: null })
    .eq("id", journeyId);
  if (error) {
    console.error("reopen journey failed", error);
    return { error: "Couldn't reopen the journey. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}
