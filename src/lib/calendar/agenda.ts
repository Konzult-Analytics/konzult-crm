// Google Calendar events and CRM bookings as one agenda. A booking that is
// already in the calendar (Cal.com puts it there) shows once, linked to its
// person; guests who are in the CRM are linked too.
import { addDays, saDate } from "@/lib/crm/dates";
import type { CalendarEvent } from "./ics";

export type AgendaBooking = {
  id: string;
  external_uid: string;
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  attendee_email: string | null;
  attendee_name: string | null;
  person_id: string | null;
  person_name: string | null;
  meeting_url: string | null;
  source: string;
};

export type AgendaPerson = { id: string; name: string };

export type AgendaItem = {
  key: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  joinUrl: string | null;
  busy: boolean;
  people: AgendaPerson[];
  booking: { id: string; uid: string; source: string } | null;
  overlaps: boolean;
};

export type AgendaDay = { date: string; items: AgendaItem[] };

/** Cal.com's calendar entry starts when the booking does. */
const SAME_START_MS = 60_000;
const DEFAULT_MINUTES = 30;

function matches(b: AgendaBooking, e: CalendarEvent): boolean {
  if (e.allDay || Math.abs(Date.parse(b.starts_at) - Date.parse(e.start)) >= SAME_START_MS) return false;
  const email = b.attendee_email?.toLowerCase();
  const name = b.attendee_name?.toLowerCase();
  return (!!email && e.attendees.includes(email)) || (!!name && e.title.toLowerCase().includes(name));
}

function uniquePeople(people: (AgendaPerson | undefined)[]): AgendaPerson[] {
  const seen = new Map<string, AgendaPerson>();
  for (const p of people) if (p && !seen.has(p.id)) seen.set(p.id, p);
  return [...seen.values()];
}

function bookingPerson(b: AgendaBooking): AgendaPerson | undefined {
  return b.person_id ? { id: b.person_id, name: b.person_name ?? b.attendee_name ?? "Someone" } : undefined;
}

function timedOverlap(a: AgendaItem, b: AgendaItem): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

export function buildAgenda(
  events: CalendarEvent[],
  bookings: AgendaBooking[],
  peopleByEmail: Map<string, AgendaPerson>
): AgendaItem[] {
  const used = new Set<string>();
  const items: AgendaItem[] = events.map((e) => {
    const b = bookings.find((x) => !used.has(x.id) && matches(x, e));
    if (b) used.add(b.id);
    return {
      key: e.key,
      title: b?.title ?? e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      location: e.location,
      joinUrl: e.joinUrl ?? b?.meeting_url ?? null,
      busy: e.busy,
      people: uniquePeople([b && bookingPerson(b), ...e.attendees.map((a) => peopleByEmail.get(a))]),
      booking: b ? { id: b.id, uid: b.external_uid, source: b.source } : null,
      overlaps: false,
    };
  });

  for (const b of bookings) {
    if (used.has(b.id)) continue;
    const end = b.ends_at ?? new Date(Date.parse(b.starts_at) + DEFAULT_MINUTES * 60_000).toISOString();
    items.push({
      key: `booking|${b.id}`,
      title: b.title ?? "Meeting",
      start: new Date(b.starts_at).toISOString(),
      end: new Date(end).toISOString(),
      allDay: false,
      location: null,
      joinUrl: b.meeting_url,
      busy: true,
      people: uniquePeople([bookingPerson(b)]),
      booking: { id: b.id, uid: b.external_uid, source: b.source },
      overlaps: false,
    });
  }

  const timed = items.filter((i) => !i.allDay && i.busy);
  for (const i of timed) i.overlaps = timed.some((o) => o !== i && timedOverlap(i, o));
  return items;
}

/** One entry per South African day from `first`, all-day items first, then by start time. */
export function groupByDay(items: AgendaItem[], first: string, days: number): AgendaDay[] {
  return Array.from({ length: days }, (_, n) => {
    const date = addDays(first, n);
    const onDay = items.filter((i) => (i.allDay ? i.start <= date && i.end > date : saDate(new Date(i.start)) === date));
    onDay.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
    return { date, items: onDay };
  });
}
