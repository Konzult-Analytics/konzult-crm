// Templates, merge fields and the POPIA s69 rule for sending from the CRM.

export type Purpose = "marketing" | "personal" | "consent_request";

export const PURPOSES = [
  { key: "personal", label: "Personal (thank-you, cover note, check-in)" },
  { key: "marketing", label: "Marketing (needs their consent, or a client)" },
  { key: "consent_request", label: "Consent request (once, to someone not yet asked)" },
] as const;

export const MERGE_FIELDS = ["{first_name}", "{full_name}", "{business}", "{links}", "{booking_link}"] as const;

export const OPT_OUT = "If you'd rather not hear from me, reply STOP and I won't send more.";

export type MergeContext = { firstName: string; fullName: string; business: string | null };
export type MessageLink = { title: string; url: string };

/**
 * Swaps the booking link in a message: replaces the old one or {booking_link},
 * or adds it at the end; with no new link, the old one (or placeholder) goes.
 */
export function swapBookingLink(text: string, oldUrl: string | null, newUrl: string | null): string {
  let out: string;
  if (oldUrl && text.includes(oldUrl)) out = text.replaceAll(oldUrl, newUrl ?? "");
  else if (text.includes("{booking_link}")) out = text.replaceAll("{booking_link}", newUrl ?? "");
  else out = newUrl ? `${text.trimEnd()}\n\n${newUrl}` : text;
  return out.replace(/\n{3,}/g, "\n\n");
}

/** Fills the name and business fields. {links} is left for linkMessage, which runs at send time. */
export function mergeFields(text: string, ctx: MergeContext): string {
  return text
    .replaceAll("{first_name}", ctx.firstName)
    .replaceAll("{full_name}", ctx.fullName)
    .replaceAll("{business}", ctx.business?.trim() || "your business");
}

/**
 * Puts each document's personal link where {links} is (or at the end), drops
 * an empty {links} line, and adds the opt-out line to marketing messages.
 */
export function linkMessage(text: string, links: MessageLink[], purpose: Purpose): string {
  const block = links.map((l) => `${l.title}: ${l.url}`).join("\n");
  let out = text.includes("{links}")
    ? text.replaceAll("{links}", block)
    : block
      ? `${text.trimEnd()}\n\n${block}`
      : text;
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  if (purpose === "marketing" && !/\bSTOP\b/.test(out)) out = `${out}\n\n${OPT_OUT}`;
  return out;
}

/** Marketing material in the message makes the whole message marketing. */
export function sendPurpose(templatePurpose: Purpose | null, documentKinds: string[]): Purpose {
  if (templatePurpose === "marketing" || documentKinds.includes("marketing")) return "marketing";
  if (templatePurpose === "consent_request") return "consent_request";
  return "personal";
}

export type Recipient = {
  consent: string;
  isClient: boolean;
  consentRequestSent: boolean;
};

/** Why this message can't go to this person (POPIA s69), or null when it can. */
export function sendBlock(purpose: Purpose, r: Recipient): string | null {
  if (r.consent === "refused") return "They asked not to receive messages from you.";
  if (purpose === "personal") return null;
  if (purpose === "consent_request") {
    if (r.consent === "granted") return "They've already agreed to hear from you.";
    if (r.consentRequestSent) return "You've already asked them once. POPIA allows one request.";
    return null;
  }
  if (r.consent === "granted" || r.isClient) return null;
  return "Marketing needs their recorded consent first (or they must be a client). Record it under Marketing consent, or send the consent request.";
}
