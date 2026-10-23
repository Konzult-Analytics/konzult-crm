// Servers run in Dublin (UTC); "today" and every date the user sees is South African time.
const ZONE = "Africa/Johannesburg";
// South Africa has no daylight saving, so the offset is fixed.
const OFFSET = "+02:00";

/** YYYY-MM-DD in South Africa for the given moment. */
export function saDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(at);
}

/** YYYY-MM-DDTHH:mm in South Africa, the format a datetime-local input expects. */
export function saDateTimeLocal(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** A datetime-local value typed in South Africa, as an ISO timestamp. */
export function saLocalToIso(local: string): string {
  return new Date(`${local}:00${OFFSET}`).toISOString();
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from one YYYY-MM-DD date to another (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Days until the next occurrence of a birthday, counted from `today` (both YYYY-MM-DD). */
export function daysUntilBirthday(birthday: string, today: string): number {
  const [, month, day] = birthday.split("-");
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    // 29 February falls on 28 February in years without it.
    let candidate = `${y}-${month}-${day}`;
    if (month === "02" && day === "29" && new Date(`${y}-02-29T00:00:00Z`).getUTCMonth() !== 1) {
      candidate = `${y}-02-28`;
    }
    const diff = daysBetween(today, candidate);
    if (diff >= 0) return diff;
  }
  return 365;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" && date.length === 10 ? new Date(`${date}T12:00:00${OFFSET}`) : new Date(date);
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function formatDateTime(at: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}

/** "14:30" in South Africa. */
export function formatTime(at: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
}

/** "Mon 26 Oct" for a YYYY-MM-DD date. */
export function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${date}T12:00:00${OFFSET}`)
  );
}

/** The next weekday after a YYYY-MM-DD date (Friday → Monday). */
export function nextWorkingDay(date: string): string {
  let next = addDays(date, 1);
  while ([0, 6].includes(new Date(`${next}T12:00:00Z`).getUTCDay())) next = addDays(next, 1);
  return next;
}

/** "today", "yesterday", "5 days ago", relative to South African today. */
export function daysAgo(at: string | Date | null | undefined, today: string = saDate()): string {
  if (!at) return "never";
  const days = daysBetween(saDate(new Date(at)), today);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return years === 1 ? "a year ago" : `${years} years ago`;
  }
  if (days >= 60) return `${Math.floor(days / 30)} months ago`;
  return `${days} days ago`;
}

/** "today", "tomorrow", "in 3 days", "2 days overdue" for a YYYY-MM-DD due date. */
export function dueLabel(due: string, today: string = saDate()): string {
  const days = daysBetween(today, due);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  return days === -1 ? "1 day overdue" : `${-days} days overdue`;
}
