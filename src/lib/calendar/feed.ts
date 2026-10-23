// Zander's Google Calendar, read through its secret iCal address. The address
// is a Vercel environment variable (GOOGLE_CALENDAR_ICS_URL, production only);
// it is never stored in the database, shown, or logged. Dev and preview use a
// made-up calendar instead.
import { saDate } from "@/lib/crm/dates";
import { readCalendar, type CalendarEvent } from "./ics";
import { sampleIcs } from "./sample";

export type CalendarState = "connected" | "sample" | "not_set" | "error";
export type CalendarResult = { state: CalendarState; events: CalendarEvent[]; readAt: string | null };

const FRESH_FOR_MS = 5 * 60_000;
const MAX_BYTES = 10 * 1024 * 1024;

let cached: { url: string; at: number; text: string } | null = null;

/** The configured address, "invalid" if it isn't a Google Calendar iCal address, or null when unset. */
function configuredUrl(): string | "invalid" | null {
  const raw = process.env.GOOGLE_CALENDAR_ICS_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "calendar.google.com" && u.pathname.endsWith(".ics") ? u.toString() : "invalid";
  } catch {
    return "invalid";
  }
}

async function calendarText(url: string): Promise<{ text: string; at: number }> {
  if (cached && cached.url === url && Date.now() - cached.at < FRESH_FOR_MS) return cached;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`calendar answered ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("calendar too large");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("calendar too large");
  cached = { url, at: Date.now(), text };
  return cached;
}

/** Events between two South African midnights. Errors are reported as a state, never thrown. */
export async function loadCalendar(from: Date, to: Date): Promise<CalendarResult> {
  const url = configuredUrl();
  if (url === null) {
    if (process.env.VERCEL_ENV === "production") return { state: "not_set", events: [], readAt: null };
    return { state: "sample", events: readCalendar(sampleIcs(saDate()), from, to), readAt: new Date().toISOString() };
  }
  if (url === "invalid") {
    console.error("GOOGLE_CALENDAR_ICS_URL is not a Google Calendar iCal address");
    return { state: "error", events: [], readAt: null };
  }
  try {
    const { text, at } = await calendarText(url);
    return { state: "connected", events: readCalendar(text, from, to), readAt: new Date(at).toISOString() };
  } catch (e) {
    // The message only; the address itself is a secret.
    console.error("read calendar failed:", e instanceof Error ? e.message : "unknown error");
    return { state: "error", events: [], readAt: null };
  }
}
