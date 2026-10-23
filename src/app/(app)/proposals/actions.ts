"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { saDate } from "@/lib/crm/dates";
import {
  checkbox,
  fields,
  optionalDate,
  optionalText,
  optionalUuid,
  requiredDate,
  requiredText,
  type FormState,
} from "@/lib/crm/forms";

const proposalSchema = z.object({
  title: requiredText(120),
  value: z.coerce.number().min(0).max(100_000_000),
  sent_on: requiredDate,
  follow_up_on: optionalDate,
  notes: optionalText(2000),
});

/** Sending moves the journey to Proposal and sets its deal value (database trigger). */
export async function addProposal(journeyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  if (!z.uuid().safeParse(journeyId).success) return { error: "That journey no longer exists." };
  const parsed = proposalSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "A proposal needs a title, a value in rand and the date it was sent." };
  const { follow_up_on, ...proposal } = parsed.data;
  const today = saDate();
  if (proposal.sent_on > today) return { error: "The sent date can't be in the future." };
  if (follow_up_on && follow_up_on < today) return { error: "Pick a follow-up date from today on." };

  const { data: journey } = await supabase
    .from("journeys")
    .select("id, track, person_id")
    .eq("id", journeyId)
    .maybeSingle();
  if (!journey || journey.track !== "client") return { error: "Proposals belong to client journeys." };

  const { error } = await supabase
    .from("proposals")
    .insert({ ...proposal, value: Math.round(proposal.value * 100) / 100, journey_id: journeyId });
  if (error) {
    console.error("add proposal failed", error);
    return { error: "Couldn't save the proposal. Try again." };
  }

  if (follow_up_on) {
    const { error: taskError } = await supabase.from("tasks").insert({
      title: `Follow up on the proposal: ${proposal.title}`.slice(0, 200),
      kind: "follow_up",
      due_on: follow_up_on,
      person_id: journey.person_id,
      journey_id: journeyId,
    });
    if (taskError) {
      console.error("proposal follow-up failed", taskError);
      revalidatePath("/", "layout");
      return { error: "The proposal is saved, but the follow-up task isn't. Add it under Tasks." };
    }
  }
  revalidatePath("/", "layout");
  return null;
}

const decisionSchema = z.object({
  decision: z.enum(["accepted", "declined"]),
  close: checkbox,
  exit_reason_id: optionalUuid,
  exit_note: optionalText(2000),
});

/** Accepted makes them a client (database trigger); declined can also close the journey as lost. */
export async function decideProposal(proposalId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  if (!z.uuid().safeParse(proposalId).success) return { error: "That proposal no longer exists." };
  const parsed = decisionSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "That decision isn't possible." };
  const { decision, close, exit_reason_id, exit_note } = parsed.data;
  const closing = decision === "declined" && close;
  if (closing && !exit_reason_id) return { error: "Pick a reason. Nothing closes without one." };

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, status, journeys(id, status, stage)")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { error: "That proposal no longer exists." };
  if (proposal.status !== "sent") return { error: "This proposal has already been decided." };

  const { error } = await supabase
    .from("proposals")
    .update({ status: decision, decided_on: saDate() })
    .eq("id", proposalId)
    .eq("status", "sent");
  if (error) {
    console.error("decide proposal failed", error);
    return { error: "Couldn't save the decision. Try again." };
  }

  const journey = proposal.journeys;
  if (closing && journey?.status === "open") {
    const { error: closeError } = await supabase
      .from("journeys")
      .update({
        status: "lost",
        exit_reason_id,
        exit_note,
        exit_stage: journey.stage,
        closed_at: new Date().toISOString(),
      })
      .eq("id", journey.id);
    if (closeError) {
      console.error("close after decline failed", closeError);
      revalidatePath("/", "layout");
      return { error: "The proposal is marked declined, but the journey didn't close. Close it with Lost… above." };
    }
  }
  revalidatePath("/", "layout");
  return null;
}
