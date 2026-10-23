"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { formatDateTime, nextWorkingDay, saDate } from "@/lib/crm/dates";

/** They didn't turn up: note it on their timeline and add a follow-up for the next working day. */
export async function markNoShow(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("booking_id"));
  if (!id.success) return;
  const { supabase } = await requireMfaSession();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, title, starts_at, status, outcome, person_id, journey_id, people(first_name, last_name)")
    .eq("id", id.data)
    .maybeSingle();
  if (!booking || booking.status !== "booked" || booking.outcome) return;

  const { error } = await supabase
    .from("bookings")
    .update({ outcome: "no_show", outcome_at: new Date().toISOString() })
    .eq("id", booking.id);
  if (error) {
    console.error("mark no-show failed", error);
    return;
  }

  const title = booking.title ?? "the meeting";
  if (booking.person_id) {
    const { data: note, error: noteError } = await supabase
      .from("interactions")
      .insert({
        type: "note",
        summary: `Didn't show for "${title}" on ${formatDateTime(booking.starts_at)}.`,
        journey_id: booking.journey_id,
      })
      .select("id")
      .single();
    if (noteError || !note) console.error("no-show note failed", noteError);
    else await supabase.from("interaction_people").insert({ interaction_id: note.id, person_id: booking.person_id });

    const { error: taskError } = await supabase.from("tasks").insert({
      title: `Follow up: missed "${title}"`,
      kind: "follow_up",
      due_on: nextWorkingDay(saDate()),
      person_id: booking.person_id,
      journey_id: booking.journey_id,
    });
    if (taskError) console.error("no-show follow-up failed", taskError);
  }
  revalidatePath("/", "layout");
}
