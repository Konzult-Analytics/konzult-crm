"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { LINK_LIFETIME_DAYS } from "@/lib/crm/documents";
import { linkMessage, mergeFields, sendBlock, sendPurpose, type MessageLink, type Purpose } from "@/lib/crm/messages";
import { personName, whatsappNumber } from "@/lib/crm/people";
import { advanceFor, isTrack } from "@/lib/crm/stages";
import { siteOrigin } from "@/lib/site";
import { signedFileUrl } from "@/lib/supabase/storage";

const sendSchema = z.object({
  person_id: z.uuid(),
  template_id: z.uuid().nullable(),
  campaign_id: z.uuid().nullable().default(null),
  document_ids: z.array(z.uuid()).max(10),
  channel: z.enum(["email", "whatsapp"]),
  subject: z.string().trim().max(200),
  body: z.string().trim().min(1).max(4000),
});

export type SendInput = z.input<typeof sendSchema>;
export type SendResult = { error: string } | { href: string; text: string };

/**
 * Checks POPIA s69 again on the server, creates one tracked link per document,
 * logs the message as a touch, and returns the mailto: or wa.me address that
 * opens it, ready to send, in Zander's own email app or WhatsApp.
 */
export async function prepareSend(input: SendInput): Promise<SendResult> {
  const { supabase } = await requireMfaSession();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: "Write a message (up to 4,000 characters) and pick up to 10 documents." };
  const s = parsed.data;

  const { data: person } = await supabase
    .from("people")
    .select("id, first_name, last_name, email, phone, marketing_consent, organisation_id, organisations(name)")
    .eq("id", s.person_id)
    .maybeSingle();
  if (!person) return { error: "That person no longer exists." };

  const { data: template } = s.template_id
    ? await supabase.from("templates").select("id, name, purpose").eq("id", s.template_id).eq("active", true).maybeSingle()
    : { data: null };
  if (s.template_id && !template) return { error: "That template isn't available any more." };

  const { data: docs } = s.document_ids.length
    ? await supabase
        .from("documents")
        .select("id, title, kind, storage_path, url, is_library, person_id")
        .in("id", s.document_ids)
        .eq("archived", false)
    : { data: [] };
  const sendable = (docs ?? []).filter((d) => d.is_library || d.person_id === person.id);
  if (sendable.length !== s.document_ids.length) return { error: "One of those documents can't be sent to this person." };

  const [{ data: journeys }, { data: asked }] = await Promise.all([
    supabase.from("journeys").select("id, track, stage, status, client_status").eq("person_id", person.id),
    supabase
      .from("interactions")
      .select("id, templates!inner(purpose), interaction_people!inner(person_id)")
      .eq("interaction_people.person_id", person.id)
      .eq("templates.purpose", "consent_request")
      .limit(1),
  ]);
  const open = (journeys ?? []).filter((j) => j.status === "open");
  const isClient = open.some((j) => j.track === "client" && j.stage === "client" && j.client_status !== "ended");
  const purpose: Purpose = sendPurpose((template?.purpose as Purpose | undefined) ?? null, sendable.map((d) => d.kind));
  const blocked = sendBlock(purpose, {
    consent: person.marketing_consent,
    isClient,
    consentRequestSent: (asked ?? []).length > 0,
  });
  if (blocked) return { error: blocked };

  const wa = whatsappNumber(person.phone);
  if (s.channel === "email" && !person.email) return { error: "Add their email address first." };
  if (s.channel === "whatsapp" && !wa) return { error: "Add their cell number first." };

  const expires = new Date(Date.now() + LINK_LIFETIME_DAYS * 86_400_000);
  const origin = await siteOrigin();
  const links: (MessageLink & { documentId: string; token: string; target: string })[] = [];
  for (const d of sendable) {
    const target = d.url ?? (d.storage_path ? await signedFileUrl(supabase, d.storage_path, LINK_LIFETIME_DAYS * 86_400) : null);
    if (!target) return { error: `Couldn't create a link for ${d.title}. Try again.` };
    const token = randomBytes(24).toString("base64url");
    links.push({ documentId: d.id, token, target, title: d.title, url: `${origin}/d/${token}` });
  }

  const ctx = { firstName: person.first_name, fullName: personName(person), business: person.organisations?.name ?? null };
  const text = linkMessage(mergeFields(s.body, ctx), links, purpose);
  const subject = mergeFields(s.subject, ctx);
  const journey = open.find((j) => j.track === "client") ?? open[0] ?? null;
  const heading = [
    template ? `Sent "${template.name}"` : "Sent a message",
    sendable.length ? `with ${sendable.map((d) => d.title).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const { data: touch, error } = await supabase
    .from("interactions")
    .insert({
      type: s.channel,
      direction: "out",
      summary: `${heading}\n\n${subject ? `${subject}\n\n` : ""}${text}`.slice(0, 10000),
      journey_id: journey?.id ?? null,
      organisation_id: person.organisation_id,
      template_id: template?.id ?? null,
      campaign_id: s.campaign_id,
      created_via: "send",
    })
    .select("id, type, direction, outcome")
    .single();
  if (error || !touch) {
    console.error("send: log touch failed", error);
    return { error: "Couldn't log the message. Nothing was sent; try again." };
  }
  const { error: linkError } = await supabase.from("interaction_people").insert({ interaction_id: touch.id, person_id: person.id });
  const { error: sendError } = links.length
    ? await supabase.from("asset_sends").insert(
        links.map((l) => ({
          document_id: l.documentId,
          person_id: person.id,
          journey_id: journey?.id ?? null,
          interaction_id: touch.id,
          channel: s.channel,
          share_token: l.token,
          target_url: l.target,
          expires_at: expires.toISOString(),
        }))
      )
    : { error: null };
  if (linkError || sendError) {
    console.error("send: links failed", linkError ?? sendError);
    await supabase.from("interactions").delete().eq("id", touch.id);
    return { error: "Couldn't create the links. Nothing was sent; try again." };
  }

  if (journey && isTrack(journey.track)) {
    const next = advanceFor(journey.track, journey.stage, touch);
    if (next) {
      const { error: moveError } = await supabase.from("journeys").update({ stage: next }).eq("id", journey.id);
      if (moveError) console.error("send: advance stage failed", moveError);
    }
  }

  revalidatePath("/", "layout");
  const href =
    s.channel === "email"
      ? `mailto:${person.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
      : `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
  return { href, text };
}

/** Switches a tracked link off: the page then says it's no longer available. */
export async function revokeSend(formData: FormData): Promise<void> {
  const { supabase } = await requireMfaSession();
  const id = z.uuid().safeParse(formData.get("send_id"));
  if (!id.success) return;
  const { error } = await supabase
    .from("asset_sends")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id.data)
    .is("revoked_at", null);
  if (error) console.error("revoke link failed", error);
  revalidatePath("/", "layout");
}
