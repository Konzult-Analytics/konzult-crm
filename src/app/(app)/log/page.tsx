import Link from "next/link";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { saDateTimeLocal } from "@/lib/crm/dates";
import { personOptions } from "@/lib/crm/lookups";
import { fetchAll } from "@/lib/supabase/fetch-all";
import LogForm, { type BookedMeeting, type OpenJourney } from "./LogForm";

export default async function LogPage({ searchParams }: { searchParams: Promise<{ person?: string; booking?: string }> }) {
  const { person, booking: bookingId } = await searchParams;
  const { supabase } = await requireMfaSession();

  // "It happened: log it" on a booking: the meeting comes pre-filled.
  const { data: booked } = z.uuid().safeParse(bookingId).success
    ? await supabase
        .from("bookings")
        .select("id, title, starts_at, event_slug, person_id, journey_id")
        .eq("id", bookingId!)
        .eq("status", "booked")
        .maybeSingle()
    : { data: null };
  const meeting: BookedMeeting | null =
    booked && booked.person_id === person
      ? {
          id: booked.id,
          title: booked.title ?? "the meeting",
          journeyId: booked.journey_id,
          startsLocal: saDateTimeLocal(new Date(booked.starts_at)),
          oneToOne: (booked.event_slug ?? "").includes("one-to-one"),
        }
      : null;

  const [people, { data: journeys }, { data: campaigns }] = await Promise.all([
    personOptions(supabase),
    fetchAll((from, to) =>
      supabase
        .from("journeys")
        .select("id, person_id, track, stage, campaign_id")
        .eq("status", "open")
        .not("person_id", "is", null)
        .order("id")
        .range(from, to)
    ),
    supabase.from("campaigns").select("id, name").eq("active", true).order("name"),
  ]);

  const chosen = people.find((p) => p.id === person) ?? null;
  const open: OpenJourney[] = (journeys ?? []).map((j) => ({ ...j, person_id: j.person_id! }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">
        {meeting && chosen
          ? `How did the ${meeting.title} with ${chosen.name} go?`
          : chosen
            ? `Log a touch with ${chosen.name}`
            : "Log a touch"}
      </h1>
      {people.length === 0 ? (
        <p className="card text-sm text-ink-soft">
          <Link href="/people/new" className="link">Add someone</Link> first, then log your touches with them.
        </p>
      ) : (
        <LogForm
          people={chosen ? [chosen] : people}
          journeys={open}
          campaigns={campaigns ?? []}
          initialPersonId={chosen?.id ?? null}
          meeting={chosen ? meeting : null}
        />
      )}
    </div>
  );
}
