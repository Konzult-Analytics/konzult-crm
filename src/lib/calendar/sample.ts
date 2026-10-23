// A made-up calendar for dev and preview, built around today, so the Calendar
// tab has something to show without touching anyone's real calendar. The
// people match the fake dev contacts (@example.test).
import { addDays } from "@/lib/crm/dates";

const pad = (n: number) => String(n).padStart(2, "0");

/** South African hour and minute on a date, in iCal's UTC form. */
function at(date: string, hour: number, minute = 0): string {
  const d = new Date(`${date}T${pad(hour)}:${pad(minute)}:00+02:00`);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function event(lines: string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

export function sampleIcs(today: string): string {
  const day = (n: number) => addDays(today, n);
  // The chapter meets on Wednesdays; start the series a few weeks back and skip one in two weeks' time.
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const lastWednesday = day(-((weekday + 4) % 7));
  const skippedWednesday = addDays(lastWednesday, 14);

  const events = [
    event([
      "UID:sample-chapter@example.test",
      `DTSTART:${at(addDays(lastWednesday, -21), 6, 30)}`,
      `DTEND:${at(addDays(lastWednesday, -21), 8, 30)}`,
      "RRULE:FREQ=WEEKLY;BYDAY=WE",
      `EXDATE:${at(skippedWednesday, 6, 30)}`,
      "SUMMARY:BNI The Cradle chapter meeting",
      "LOCATION:Chapter venue (sample)",
    ]),
    event([
      "UID:sample-plan@example.test",
      `DTSTART:${at(today, 8)}`,
      `DTEND:${at(today, 8, 30)}`,
      "SUMMARY:Plan the week",
    ]),
    event([
      "UID:sample-workshop@example.test",
      `DTSTART:${at(today, 14)}`,
      `DTEND:${at(today, 15, 30)}`,
      "SUMMARY:Client workshop (sample)",
      "ATTENDEE;CN=Pieter van Wyk:mailto:pieter@example.test",
      "X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij",
    ]),
    event([
      "UID:sample-naledi@example.test",
      `DTSTART:${at(day(1), 10)}`,
      `DTEND:${at(day(1), 10, 45)}`,
      "SUMMARY:Discovery call between Zander Kotze and Naledi Dlamini",
      "ATTENDEE;CN=Naledi Dlamini:mailto:naledi@example.test",
      "LOCATION:https://app.cal.com/video/sample-room",
    ]),
    event([
      "UID:sample-bank@example.test",
      `DTSTART:${at(day(1), 10, 30)}`,
      `DTEND:${at(day(1), 11)}`,
      "SUMMARY:Call with the bank (sample)",
    ]),
    event([
      "UID:sample-supplier@example.test",
      `DTSTART:${at(day(1), 15)}`,
      `DTEND:${at(day(1), 15, 30)}`,
      "SUMMARY:Supplier call (cancelled)",
      "STATUS:CANCELLED",
    ]),
    event([
      "UID:sample-concert@example.test",
      `DTSTART:${at(day(2), 17)}`,
      `DTEND:${at(day(2), 18, 30)}`,
      "SUMMARY:School concert",
    ]),
    event([
      "UID:sample-month-end@example.test",
      `DTSTART;VALUE=DATE:${day(3).replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${day(4).replace(/-/g, "")}`,
      "SUMMARY:Month-end close",
      "TRANSP:TRANSPARENT",
    ]),
  ];

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Konzult CRM//Sample//EN", ...events, "END:VCALENDAR", ""].join("\r\n");
}
