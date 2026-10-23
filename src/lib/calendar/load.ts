import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/crm/dates";
import { personName } from "@/lib/crm/people";
import type { Database } from "@/lib/supabase/database.types";
import { buildAgenda, groupByDay, type AgendaDay, type AgendaPerson } from "./agenda";
import { loadCalendar, type CalendarState } from "./feed";

type Client = SupabaseClient<Database>;

const EMAILS_PER_QUERY = 200;

export type Agenda = { state: CalendarState; readAt: string | null; days: AgendaDay[] };

/** The calendar and the CRM's bookings for `days` days from `first` (YYYY-MM-DD, South African). */
export async function loadAgenda(supabase: Client, first: string, days: number): Promise<Agenda> {
  const from = new Date(`${first}T00:00:00+02:00`);
  const to = new Date(`${addDays(first, days)}T00:00:00+02:00`);
  const [calendar, { data: bookings, error }] = await Promise.all([
    loadCalendar(from, to),
    supabase
      .from("bookings")
      .select("id, external_uid, title, starts_at, ends_at, attendee_email, attendee_name, person_id, meeting_url, source, people(first_name, last_name)")
      .eq("status", "booked")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at"),
  ]);
  if (error) console.error("load bookings failed", error);

  const emails = [...new Set(calendar.events.flatMap((e) => e.attendees))];
  const peopleByEmail = new Map<string, AgendaPerson>();
  for (let i = 0; i < emails.length; i += EMAILS_PER_QUERY) {
    const { data } = await supabase
      .from("people")
      .select("id, first_name, last_name, email")
      .in("email", emails.slice(i, i + EMAILS_PER_QUERY));
    for (const p of data ?? []) if (p.email) peopleByEmail.set(p.email.toLowerCase(), { id: p.id, name: personName(p) });
  }

  const items = buildAgenda(
    calendar.events,
    (bookings ?? []).map((b) => ({ ...b, person_name: b.people ? personName(b.people) : null })),
    peopleByEmail
  );
  return { state: calendar.state, readAt: calendar.readAt, days: groupByDay(items, first, days) };
}
