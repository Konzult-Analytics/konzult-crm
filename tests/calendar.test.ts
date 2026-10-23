import { describe, it, expect } from "vitest";
import { buildAgenda, groupByDay, type AgendaBooking } from "@/lib/calendar/agenda";
import { readCalendar } from "@/lib/calendar/ics";
import { sampleIcs } from "@/lib/calendar/sample";

// Shaped like Google Calendar's secret iCal address: a named time zone, a
// weekly series with a skipped week and a moved week, UTC and floating times.
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "BEGIN:VTIMEZONE",
  "TZID:Africa/Johannesburg",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0200",
  "TZNAME:SAST",
  "DTSTART:19700101T000000",
  "END:STANDARD",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Africa/Johannesburg:20261028T063000",
  "DTEND;TZID=Africa/Johannesburg:20261028T083000",
  "RRULE:FREQ=WEEKLY;BYDAY=WE",
  "EXDATE;TZID=Africa/Johannesburg:20261104T063000",
  "UID:chapter@google.com",
  "SUMMARY:Chapter meeting",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Africa/Johannesburg:20261111T070000",
  "DTEND;TZID=Africa/Johannesburg:20261111T090000",
  "RECURRENCE-ID;TZID=Africa/Johannesburg:20261111T063000",
  "UID:chapter@google.com",
  "SUMMARY:Chapter meeting (visitors day)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261026T080000Z",
  "DTEND:20261026T084500Z",
  "UID:cal-1@Cal.com",
  "SUMMARY:Discovery call between Zander Kotze and Naledi Dlamini",
  "ATTENDEE;CN=Naledi;PARTSTAT=ACCEPTED:mailto:Naledi@Example.test",
  "ATTENDEE:mailto:zander@konzult.test",
  "LOCATION:https://app.cal.com/video/room",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261026T083000Z",
  "DTEND:20261026T090000Z",
  "UID:bank@google.com",
  "SUMMARY:Call with the bank",
  "DESCRIPTION:Join: https://meet.google.com/abc-defg-hij\\nThanks",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261030",
  "DTEND;VALUE=DATE:20261031",
  "UID:monthend@google.com",
  "SUMMARY:Month-end close",
  "TRANSP:TRANSPARENT",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261027T120000",
  "DTEND:20261027T130000",
  "UID:floating@google.com",
  "SUMMARY:Lunch",
  "LOCATION:javascript:alert(1)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261027T130000Z",
  "DTEND:20261027T140000Z",
  "UID:gone@google.com",
  "SUMMARY:Cancelled thing",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20250101T080000Z",
  "DTEND:20250101T090000Z",
  "UID:old@google.com",
  "SUMMARY:Last year",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const FROM = new Date("2026-10-26T00:00:00+02:00");
const TO = new Date("2026-11-16T00:00:00+02:00");

describe("reading a Google calendar", () => {
  const events = readCalendar(ICS, FROM, TO);

  it("expands repeating events, skipping removed weeks and applying moved ones", () => {
    expect(events.filter((e) => e.title.startsWith("Chapter")).map((e) => [e.title, e.start])).toEqual([
      ["Chapter meeting", "2026-10-28T04:30:00.000Z"],
      ["Chapter meeting (visitors day)", "2026-11-11T05:00:00.000Z"],
    ]);
  });

  it("keeps only the window's events, drops cancelled ones, and reads a time without a zone as South African", () => {
    expect(events.map((e) => e.title)).toEqual([
      "Discovery call between Zander Kotze and Naledi Dlamini",
      "Call with the bank",
      "Lunch",
      "Chapter meeting",
      "Month-end close",
      "Chapter meeting (visitors day)",
    ]);
    expect(events.find((e) => e.title === "Lunch")).toMatchObject({ start: "2026-10-27T10:00:00.000Z", joinUrl: null });
  });

  it("reads guests, join links and free time", () => {
    const call = events[0];
    expect(call.attendees).toEqual(["naledi@example.test", "zander@konzult.test"]);
    expect(call.joinUrl).toBe("https://app.cal.com/video/room");
    expect(events[1].joinUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(events.find((e) => e.allDay)).toMatchObject({ title: "Month-end close", start: "2026-10-30", end: "2026-10-31", busy: false });
  });

  it("refuses something that isn't a calendar", () => {
    expect(() => readCalendar("<html>Sign in</html>", FROM, TO)).toThrow();
  });

  it("builds a sample calendar for dev that reads cleanly", () => {
    const sample = readCalendar(sampleIcs("2026-10-26"), FROM, new Date("2026-11-02T00:00:00+02:00"));
    expect(sample.map((e) => e.title)).toContain("BNI The Cradle chapter meeting");
    expect(sample.some((e) => e.title.includes("cancelled"))).toBe(false);
  });
});

describe("the agenda", () => {
  const events = readCalendar(ICS, FROM, TO);
  const bookings: AgendaBooking[] = [
    {
      id: "b1",
      external_uid: "uid1",
      title: "Discovery call",
      starts_at: "2026-10-26T08:00:00+00:00",
      ends_at: "2026-10-26T08:45:00+00:00",
      attendee_email: "naledi@example.test",
      attendee_name: "Naledi Dlamini",
      person_id: "p1",
      person_name: "Naledi Dlamini",
      meeting_url: null,
      source: "qr",
    },
    {
      id: "b2",
      external_uid: "uid2",
      title: "BNI one-to-one",
      starts_at: "2026-10-29T12:00:00+00:00",
      ends_at: null,
      attendee_email: "riaan@example.test",
      attendee_name: "Riaan du Toit",
      person_id: "p2",
      person_name: "Riaan du Toit",
      meeting_url: "https://app.cal.com/video/b2",
      source: "link",
    },
  ];
  const items = buildAgenda(events, bookings, new Map([["naledi@example.test", { id: "p1", name: "Naledi Dlamini" }]]));

  it("shows a booking that's already in the calendar once, under its short name and person", () => {
    const call = items.find((i) => i.booking?.id === "b1");
    expect(call).toMatchObject({ title: "Discovery call", people: [{ id: "p1", name: "Naledi Dlamini" }], joinUrl: "https://app.cal.com/video/room" });
    expect(items.filter((i) => i.title.includes("Naledi"))).toHaveLength(0);
  });

  it("adds bookings the calendar doesn't have yet, with a default length", () => {
    expect(items.find((i) => i.booking?.id === "b2")).toMatchObject({
      key: "booking|b2",
      start: "2026-10-29T12:00:00.000Z",
      end: "2026-10-29T12:30:00.000Z",
      joinUrl: "https://app.cal.com/video/b2",
    });
  });

  it("flags busy times that overlap, but not free ones", () => {
    expect(items.filter((i) => i.overlaps).map((i) => i.title)).toEqual(["Discovery call", "Call with the bank"]);
  });

  it("groups by South African day, all-day items first", () => {
    const days = groupByDay(items, "2026-10-26", 5);
    expect(days.map((d) => [d.date, d.items.map((i) => i.title)])).toEqual([
      ["2026-10-26", ["Discovery call", "Call with the bank"]],
      ["2026-10-27", ["Lunch"]],
      ["2026-10-28", ["Chapter meeting"]],
      ["2026-10-29", ["BNI one-to-one"]],
      ["2026-10-30", ["Month-end close"]],
    ]);
  });
});
