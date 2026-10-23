// Turns what Cal.com and the website send into the flat shapes the database
// door functions take. Anything unexpected is dropped or cut to length, and a
// zod schema checks the result before it goes anywhere near the database.
import { z } from "zod";

const optional = (max: number) => z.string().max(max).nullable().optional();

const calEventSchema = z.object({
  event: z.enum(["created", "rescheduled", "cancelled", "ping", "ignored"]),
  uid: z.string().min(1).max(200).optional(),
  previous_uid: optional(200),
  slug: optional(100),
  title: optional(200),
  starts_at: z.iso.datetime().optional(),
  ends_at: z.iso.datetime().nullable().optional(),
  name: optional(160),
  email: z.email().max(254).nullable().optional(),
  phone: optional(40),
  business: optional(160),
  notes: optional(2000),
});

const websiteLeadSchema = z.object({
  event: z.enum(["lead", "spam", "ignored"]),
  id: z.string().min(1).max(200).optional(),
  name: optional(160),
  email: z.email().max(254).nullable().optional(),
  phone: optional(40),
  business: optional(160),
  message: optional(4000),
  marketing_consent: z.boolean().optional(),
});

export type CalEvent = {
  event: "created" | "rescheduled" | "cancelled" | "ping" | "ignored";
  uid?: string;
  previous_uid?: string | null;
  slug?: string | null;
  title?: string | null;
  starts_at?: string;
  ends_at?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  business?: string | null;
  notes?: string | null;
};

export type WebsiteLead = {
  event: "lead" | "spam" | "ignored";
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  business?: string | null;
  message?: string | null;
  marketing_consent?: boolean;
};

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function email(v: unknown): string | null {
  const s = text(v, 254);
  return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null;
}

function isoTime(v: unknown): string | null {
  const s = text(v, 40);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null;
}

/** Cal.com answers live in payload.responses.<identifier>.value. */
function answer(responses: unknown, key: string): unknown {
  if (!isObject(responses)) return undefined;
  const r = responses[key];
  return isObject(r) ? r.value : r;
}

const CAL_EVENTS: Record<string, CalEvent["event"]> = {
  BOOKING_CREATED: "created",
  BOOKING_RESCHEDULED: "rescheduled",
  BOOKING_CANCELLED: "cancelled",
  PING: "ping",
};

export function readCalEvent(body: unknown): CalEvent {
  const parsed = calEventSchema.safeParse(flattenCal(body));
  return parsed.success ? parsed.data : { event: "ignored" };
}

function flattenCal(body: unknown): CalEvent {
  if (!isObject(body)) return { event: "ignored" };
  const event = CAL_EVENTS[String(body.triggerEvent ?? "")] ?? "ignored";
  if (event === "ping" || event === "ignored") return { event };
  const p = isObject(body.payload) ? body.payload : {};
  const uid = text(p.uid, 200);
  if (!uid) return { event: "ignored" };
  if (event === "cancelled") return { event, uid };

  const startsAt = isoTime(p.startTime);
  if (!startsAt) return { event: "ignored" };
  const attendee = Array.isArray(p.attendees) && isObject(p.attendees[0]) ? p.attendees[0] : {};
  return {
    event,
    uid,
    previous_uid: text(p.rescheduleUid, 200),
    slug: text(p.type, 100),
    title: text(p.title, 200),
    starts_at: startsAt,
    ends_at: isoTime(p.endTime),
    name: text(attendee.name, 160) ?? text(answer(p.responses, "name"), 160),
    email: email(attendee.email) ?? email(answer(p.responses, "email")),
    phone:
      text(answer(p.responses, "attendeePhoneNumber"), 40) ??
      text(answer(p.responses, "phone"), 40) ??
      text(attendee.phoneNumber, 40),
    business: text(answer(p.responses, "business"), 160),
    notes: text(answer(p.responses, "notes"), 2000) ?? text(p.additionalNotes, 2000),
  };
}

const FIELD_NAMES: Record<string, keyof WebsiteLead | "honeypot"> = {
  name: "name",
  "full name": "name",
  email: "email",
  "email address": "email",
  phone: "phone",
  cell: "phone",
  mobile: "phone",
  business: "business",
  company: "business",
  message: "message",
  marketing_consent: "marketing_consent",
  consent: "marketing_consent",
  // Hidden from people; bots fill it in.
  website: "honeypot",
};

const YES = new Set(["true", "on", "yes", "1", "checked"]);

/** Framer posts the form's fields by their names; the new website will post the same. */
export function readWebsiteLead(body: unknown, submissionId: string): WebsiteLead {
  const parsed = websiteLeadSchema.safeParse(flattenWebsite(body, submissionId));
  return parsed.success ? parsed.data : { event: "ignored" };
}

function flattenWebsite(body: unknown, submissionId: string): WebsiteLead {
  if (!isObject(body)) return { event: "ignored" };
  const fields: Json = {};
  for (const [k, v] of Object.entries(body)) {
    const name = FIELD_NAMES[k.trim().toLowerCase()];
    if (name) fields[name] = v;
  }
  if (text(fields.honeypot, 200)) return { event: "spam" };
  const lead: WebsiteLead = {
    event: "lead",
    id: submissionId.slice(0, 200),
    name: text(fields.name, 160),
    email: email(fields.email),
    phone: text(fields.phone, 40),
    business: text(fields.business, 160),
    message: text(fields.message, 4000),
    marketing_consent: fields.marketing_consent === true || YES.has(String(fields.marketing_consent ?? "").trim().toLowerCase()),
  };
  // Nothing to reply to means nothing to keep.
  return lead.email || lead.phone ? lead : { event: "ignored" };
}
