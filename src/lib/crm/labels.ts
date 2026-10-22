// Option lists mirror the check constraints in 20261022140000_crm_core.sql.

export const TOUCH_TYPES = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "call", label: "Call" },
  { key: "email", label: "Email" },
  { key: "meeting", label: "Meeting" },
  { key: "bni_message", label: "BNI Connect" },
  { key: "note", label: "Note" },
] as const;
export type TouchType = (typeof TOUCH_TYPES)[number]["key"];

export const OUTCOMES = [
  { key: "no_reply", label: "No reply yet" },
  { key: "replied", label: "Replied" },
  { key: "interested", label: "Interested" },
  { key: "not_interested", label: "Not interested" },
  { key: "meeting_booked", label: "Meeting booked" },
] as const;

export const MEETING_PURPOSES = [
  { key: "sales", label: "Sales" },
  { key: "referral", label: "Referral" },
  { key: "client_care", label: "Client care" },
] as const;

export const MEETING_SETTINGS = [
  { key: "bni_one_to_one", label: "BNI one-to-one" },
  { key: "external", label: "In person" },
  { key: "online", label: "Online" },
] as const;

export const SIZE_BANDS = [
  { key: "1", label: "Just them" },
  { key: "2-10", label: "2–10 people" },
  { key: "11-50", label: "11–50 people" },
  { key: "51-200", label: "51–200 people" },
  { key: "200+", label: "200+ people" },
] as const;

export const TURNOVER_BANDS = [
  { key: "under_1m", label: "Under R1m" },
  { key: "1m_5m", label: "R1m–R5m" },
  { key: "5m_20m", label: "R5m–R20m" },
  { key: "20m_50m", label: "R20m–R50m" },
  { key: "over_50m", label: "Over R50m" },
] as const;

export const TASK_KINDS = [
  { key: "follow_up", label: "Follow-up" },
  { key: "check_in", label: "Check-in" },
  { key: "birthday", label: "Birthday" },
  { key: "payment", label: "Payment check" },
  { key: "referral_ask", label: "Ask for referral" },
  { key: "revisit", label: "Revisit" },
  { key: "other", label: "Other" },
] as const;

type Option = { readonly key: string; readonly label: string };

export function labelOf(options: readonly Option[], key: string | null | undefined): string {
  return options.find((o) => o.key === key)?.label ?? "";
}

export function keysOf<T extends readonly Option[]>(options: T): [T[number]["key"], ...T[number]["key"][]] {
  return options.map((o) => o.key) as [T[number]["key"], ...T[number]["key"][]];
}
