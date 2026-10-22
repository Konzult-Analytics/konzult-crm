import type { TouchType } from "@/lib/crm/labels";

export type Cell = string | number | boolean | null | undefined;

/** Trimmed text with runs of whitespace (including non-breaking spaces) collapsed; null if empty. */
export function cleanText(value: Cell, max = 500): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[\s ]+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

/** "Thandi  Mokoena-Smith" → first "Thandi", last "Mokoena-Smith". */
export function splitName(full: string | null): { firstName: string | null; lastName: string | null } {
  const text = cleanText(full, 160);
  if (!text) return { firstName: null, lastName: null };
  const [first, ...rest] = text.split(" ");
  return { firstName: first.slice(0, 80), lastName: rest.length ? rest.join(" ").slice(0, 80) : null };
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(value: Cell): string | null {
  const text = cleanText(value, 254)?.toLowerCase().replace(/^mailto:/, "") ?? null;
  return text && EMAIL.test(text) ? text : null;
}

export function cleanPhone(value: Cell): string | null {
  const text = cleanText(value, 40);
  // Excel often stores numbers without the leading 0: 821234567 → 0821234567.
  if (text && /^\d{9}$/.test(text)) return `0${text}`;
  return text && /\d{6,}/.test(text.replace(/\D/g, "")) ? text : null;
}

/** A number for matching: South African numbers in any format compare equal. */
export function phoneKey(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `27${digits.slice(1)}`;
  if (digits.length === 9) return `27${digits}`;
  return digits.length >= 9 ? digits : null;
}

/** Lower-case, accents and punctuation removed: for comparing names. */
export function nameKey(...parts: (string | null)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Business names compare without "(Pty) Ltd", "CC", "&"/"and" and similar noise. */
export function organisationKey(name: string | null): string {
  return nameKey(name)
    .replace(/\b(pty|ltd|limited|cc|inc|incorporated|the|and)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** A spreadsheet date as YYYY-MM-DD: Excel serial numbers, 2026/10/21, 2026-10-21 or 21/10/2026. */
export function cleanDate(value: Cell): string | null {
  if (typeof value === "number" && value > 20000 && value < 80000) {
    return new Date(EXCEL_EPOCH + Math.round(value) * 86_400_000).toISOString().slice(0, 10);
  }
  const text = cleanText(value, 40);
  if (!text) return null;
  let m = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return isoParts(m[1], m[2], m[3]);
  m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return isoParts(m[3], m[2], m[1]);
  return null;
}

function isoParts(y: string, mo: string, d: string): string | null {
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** Reply / result text from a sheet as a touch outcome. */
export function outcomeFrom(text: string | null): "no_reply" | "replied" | "interested" | "not_interested" | "meeting_booked" {
  const t = (text ?? "").trim().toLowerCase();
  if (!t || /^(n|no|none|-|no reply)$/.test(t)) return "no_reply";
  if (/meeting|booked|one.to.one|1.?2.?1/.test(t)) return "meeting_booked";
  if (/not interested|declin|no thanks|unsubscrib|not now/.test(t)) return "not_interested";
  if (/interest/.test(t)) return "interested";
  return "replied";
}

/** A channel hint from a "Channel" cell or a sheet name. */
export function channelFrom(text: string | null): TouchType | null {
  const t = (text ?? "").toLowerCase();
  if (/bni connect/.test(t)) return "bni_message";
  if (/whats\s?app/.test(t)) return "whatsapp";
  if (/call|phone/.test(t)) return "call";
  if (/e-?mail/.test(t)) return "email";
  return null;
}
