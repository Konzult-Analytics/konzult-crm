// Reads a calendar in iCal format (Google Calendar's secret address) into the
// events that fall in a window, with repeating events expanded and moved or
// cancelled occurrences applied.
import ICAL from "ical.js";
import { saDate } from "@/lib/crm/dates";
import { httpsUrl } from "@/lib/inbound/messages";

type Component = InstanceType<typeof ICAL.Component>;
type IcalEvent = InstanceType<typeof ICAL.Event>;
type Time = InstanceType<typeof ICAL.Time>;

export type CalendarEvent = {
  key: string;
  title: string;
  /** ISO instants for timed events; YYYY-MM-DD (end exclusive) for all-day ones. */
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  joinUrl: string | null;
  /** Guests' email addresses, lower case. */
  attendees: string[];
  /** False for events marked "free", which don't block time. */
  busy: boolean;
};

/** Stops a runaway rule from expanding forever. */
const MAX_OCCURRENCES = 5000;
const DAY = 86_400_000;
const MEETING_HOSTS = /^https:\/\/(meet\.google\.com|[\w-]+\.zoom\.us|zoom\.us|teams\.microsoft\.com|teams\.live\.com|app\.cal\.com\/video|cal\.com\/video)\//i;

/**
 * A time without a known zone is read as South African time (Google always
 * names its zones, so this is only a fallback).
 */
function instant(t: Time): Date {
  if (t.isDate) return new Date(`${dateOnly(t)}T00:00:00+02:00`);
  if (!t.zone || t.zone.tzid === "floating") return new Date(`${t.toString().slice(0, 19)}+02:00`);
  return t.toJSDate();
}

function dateOnly(t: Time): string {
  return t.toString().slice(0, 10);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function joinLink(c: Component, location: string | null, description: string | null): string | null {
  const conference = httpsUrl(c.getFirstPropertyValue("x-google-conference"));
  if (conference) return conference;
  const fromLocation = httpsUrl(location);
  if (fromLocation) return fromLocation;
  for (const m of (description ?? "").matchAll(/https:\/\/[^\s<>"]+/g)) {
    if (MEETING_HOSTS.test(m[0])) return httpsUrl(m[0]);
  }
  return null;
}

function attendeesOf(c: Component): string[] {
  return c
    .getAllProperties("attendee")
    .map((p) => String(p.getFirstValue() ?? "").replace(/^mailto:/i, "").trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function toEvent(item: IcalEvent, startTime: Time, endTime: Time | null): CalendarEvent | null {
  const c = item.component;
  if (String(c.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return null;
  const allDay = startTime.isDate;
  let start: string;
  let end: string;
  if (allDay) {
    start = dateOnly(startTime);
    const e = endTime ? dateOnly(endTime) : null;
    end = e && e > start ? e : new Date(Date.parse(`${start}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  } else {
    const s = instant(startTime);
    const e = endTime ? instant(endTime) : s;
    start = s.toISOString();
    end = (e > s ? e : s).toISOString();
  }
  const location = str(item.location);
  return {
    key: `${item.uid}|${start}`,
    title: str(item.summary) ?? "(no title)",
    start,
    end,
    allDay,
    location,
    joinUrl: joinLink(c, location, str(item.description)),
    attendees: attendeesOf(c),
    busy: String(c.getFirstPropertyValue("transp") ?? "").toUpperCase() !== "TRANSPARENT",
  };
}

function overlaps(e: CalendarEvent, from: Date, to: Date): boolean {
  if (e.allDay) return e.end > saDate(from) && e.start < saDate(to);
  return Date.parse(e.end) > from.getTime() && Date.parse(e.start) < to.getTime();
}

/**
 * The events between `from` and `to` (South African midnights, `to` exclusive),
 * earliest first. Throws if the text isn't a calendar.
 */
export function readCalendar(text: string, from: Date, to: Date): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== "vcalendar") throw new Error("not a calendar");
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

  // A repeating event and its one-off changes share a UID; the changes carry a RECURRENCE-ID.
  const masters = new Map<string, IcalEvent>();
  const changes: Component[] = [];
  for (const c of root.getAllSubcomponents("vevent")) {
    if (c.hasProperty("recurrence-id")) changes.push(c);
    else masters.set(String(c.getFirstPropertyValue("uid") ?? ""), new ICAL.Event(c));
  }
  const orphans: IcalEvent[] = [];
  for (const c of changes) {
    const master = masters.get(String(c.getFirstPropertyValue("uid") ?? ""));
    if (master) master.relateException(c);
    else orphans.push(new ICAL.Event(c));
  }

  const out: CalendarEvent[] = [];
  const stopAfter = to.getTime() + DAY;
  for (const ev of masters.values()) {
    if (!ev.isRecurring()) {
      const e = toEvent(ev, ev.startDate, ev.endDate);
      if (e && overlaps(e, from, to)) out.push(e);
      continue;
    }
    const it = ev.iterator();
    for (let n = 0, next = it.next(); next && n < MAX_OCCURRENCES; n++, next = it.next()) {
      if (instant(next).getTime() > stopAfter) break;
      const d = ev.getOccurrenceDetails(next);
      const e = toEvent(d.item, d.startDate, d.endDate);
      if (e && overlaps(e, from, to)) out.push(e);
    }
  }
  for (const ev of orphans) {
    const e = toEvent(ev, ev.startDate, ev.endDate);
    if (e && overlaps(e, from, to)) out.push(e);
  }

  return out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
