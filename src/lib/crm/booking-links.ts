// Links to Zander's Cal.com booking page: pre-filled for a person, or tagged
// for the QR code, so the booking that comes back says where it came from.
import { z } from "zod";

export type BookingType = { slug: string; label: string };
export type BookingSource = "link" | "qr" | "crm";

export const BOOKING_SOURCES = [
  { key: "link", label: "Booking page" },
  { key: "qr", label: "QR code" },
  { key: "crm", label: "Sent from the CRM" },
] as const;

/** Rows of the booking-links form; a row with neither field filled in is ignored. */
export const BOOKING_TYPE_ROWS = 6;

const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const UID = /^[A-Za-z0-9_-]{1,100}$/;

export const bookingTypeSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(SLUG, "Use the event's link name, e.g. discovery-call"),
  label: z.string().trim().min(1).max(60),
});

export const bookingPageSchema = z.url({ protocol: /^https$/ }).max(200);

/** The saved event types, skipping anything malformed. */
export function readBookingTypes(value: unknown): BookingType[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const parsed = bookingTypeSchema.safeParse(v);
    return parsed.success ? [parsed.data] : [];
  });
}

/** "082 555 0101" → "+27825550101": Cal.com's phone question wants the international form. */
export function internationalCell(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10 && digits.startsWith("0")) return `+27${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("27")) return `+${digits}`;
  return null;
}

export type Prefill = { name?: string | null; email?: string | null; phone?: string | null; business?: string | null };

/** A booking link for one event type, optionally pre-filled and tagged with where it was shared. */
export function bookingUrl(page: string, slug: string, opts: { source?: BookingSource; prefill?: Prefill } = {}): string {
  const url = new URL(`${page.replace(/\/+$/, "")}/${encodeURIComponent(slug)}`);
  const p = opts.prefill;
  if (p?.name?.trim()) url.searchParams.set("name", p.name.trim());
  if (p?.email?.trim()) url.searchParams.set("email", p.email.trim());
  const cell = internationalCell(p?.phone);
  if (cell) url.searchParams.set("attendeePhoneNumber", cell);
  if (p?.business?.trim()) url.searchParams.set("business", p.business.trim());
  if (opts.source && opts.source !== "link") url.searchParams.set("metadata[source]", opts.source);
  return url.toString();
}

/** Cal.com's own pages for moving or cancelling a booking, or null for an unexpected booking ID. */
export function bookingChangeUrls(page: string | null, uid: string): { reschedule: string; cancel: string } | null {
  if (!UID.test(uid)) return null;
  let origin = "https://cal.com";
  try {
    if (page) origin = new URL(page).origin;
  } catch {
    // keep Cal.com's own address
  }
  return { reschedule: `${origin}/reschedule/${uid}`, cancel: `${origin}/booking/${uid}?cancel=true` };
}
