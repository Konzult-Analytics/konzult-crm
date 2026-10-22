"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { saDate } from "@/lib/crm/dates";
import { fields, optionalDate, optionalText, type FormState } from "@/lib/crm/forms";
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
