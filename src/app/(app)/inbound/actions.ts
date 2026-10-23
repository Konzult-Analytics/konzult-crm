"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { saDate } from "@/lib/crm/dates";
import { findOrCreateOrganisation } from "@/lib/crm/organisations";
import { keyFingerprint, newConnectionKey } from "@/lib/inbound/signatures";
import { siteOrigin } from "@/lib/site";

export type NewConnection = { error: string } | { kind: string; url: string; key: string } | null;

const PATHS = { cal: "cal", website: "website" } as const;

/** Creates a connection and shows its key once; the database keeps only the fingerprint. */
export async function createConnection(kind: "cal" | "website"): Promise<NewConnection> {
  const { supabase } = await requireMfaSession();
  if (!(kind in PATHS)) return { error: "Unknown connection." };
  const key = newConnectionKey();
  const { error } = await supabase
    .from("inbound_connections")
    .insert({ kind, key_hash: keyFingerprint(key), key_hint: key.slice(-4) });
  if (error) {
    console.error("create connection failed", error);
    return { error: "Couldn't create the connection. Try again." };
  }
  revalidatePath("/", "layout");
  return { kind, url: `${await siteOrigin()}/api/inbound/${PATHS[kind]}/${key}`, key };
}

/** Switched off at once: the door refuses that key from now on. */
export async function revokeConnection(formData: FormData): Promise<void> {
  const { supabase } = await requireMfaSession();
  const id = z.uuid().safeParse(formData.get("connection_id"));
  if (!id.success) return;
  const { error } = await supabase
    .from("inbound_connections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id.data)
    .is("revoked_at", null);
  if (error) console.error("revoke connection failed", error);
  revalidatePath("/", "layout");
}

/**
 * One tap from Today's inbox: the person (matched by email, or added, with
 * consent if they ticked the box), a client journey from the website, the
 * enquiry on their timeline and a task to reply today.
 */
export async function addLead(formData: FormData): Promise<void> {
  const { supabase } = await requireMfaSession();
  const id = z.uuid().safeParse(formData.get("lead_id"));
  if (!id.success) return;
  const { data: lead } = await supabase
    .from("inbound_leads")
    .select("id, name, email, phone, business, message, marketing_consent, received_at, status")
    .eq("id", id.data)
    .maybeSingle();
  if (!lead || lead.status !== "new") return;

  const today = saDate();
  const consent = lead.marketing_consent
    ? { marketing_consent: "granted", marketing_consent_at: lead.received_at, marketing_consent_note: "Ticked the consent box on the website form" }
    : {};
  const { data: existing } = lead.email
    ? await supabase.from("people").select("id, organisation_id, marketing_consent").eq("email", lead.email).limit(1).maybeSingle()
    : { data: null };

  let personId = existing?.id ?? null;
  let organisationId = existing?.organisation_id ?? null;
  if (!personId) {
    organisationId = lead.business ? await findOrCreateOrganisation(supabase, lead.business) : null;
    const name = (lead.name ?? lead.email?.split("@")[0] ?? "Website visitor").trim();
    const [first, ...rest] = name.split(/\s+/);
    const { data: person, error } = await supabase
      .from("people")
      .insert({
        first_name: first.slice(0, 80),
        last_name: rest.join(" ").slice(0, 80) || null,
        email: lead.email,
        phone: lead.phone,
        organisation_id: organisationId,
        ...consent,
      })
      .select("id")
      .single();
    if (error || !person) {
      console.error("add lead: person failed", error);
      return;
    }
    personId = person.id;
  } else if (lead.marketing_consent && existing?.marketing_consent === "unknown") {
    await supabase.from("people").update(consent).eq("id", personId);
  }

  const { data: open } = await supabase
    .from("journeys")
    .select("id")
    .eq("person_id", personId)
    .eq("track", "client")
    .neq("status", "lost")
    .limit(1)
    .maybeSingle();
  let journeyId = open?.id ?? null;
  if (!journeyId) {
    const { data: source } = await supabase.from("sources").select("id").eq("label", "Website").maybeSingle();
    const { data: journey } = await supabase
      .from("journeys")
      .insert({ track: "client", person_id: personId, source_id: source?.id ?? null })
      .select("id")
      .single();
    journeyId = journey?.id ?? null;
  }

  const { data: touch } = await supabase
    .from("interactions")
    .insert({
      type: "email",
      direction: "in",
      occurred_at: lead.received_at,
      summary: `Website enquiry${lead.message ? `:\n\n${lead.message}` : "."}`,
      journey_id: journeyId,
      organisation_id: organisationId,
      created_via: "website",
    })
    .select("id")
    .single();
  if (touch) await supabase.from("interaction_people").insert({ interaction_id: touch.id, person_id: personId });
  await supabase.from("tasks").insert({
    title: (lead.name ? `Reply to ${lead.name}'s website enquiry` : "Reply to the website enquiry").slice(0, 200),
    kind: "follow_up",
    due_on: today,
    person_id: personId,
    journey_id: journeyId,
  });

  const { error } = await supabase
    .from("inbound_leads")
    .update({ status: "added", person_id: personId, decided_at: new Date().toISOString() })
    .eq("id", lead.id);
  if (error) console.error("add lead: mark added failed", error);
  revalidatePath("/", "layout");
}

/** Spam or not a lead: kept out of the contacts, and out of the inbox. */
export async function discardLead(formData: FormData): Promise<void> {
  const { supabase } = await requireMfaSession();
  const id = z.uuid().safeParse(formData.get("lead_id"));
  if (!id.success) return;
  const { error } = await supabase
    .from("inbound_leads")
    .update({ status: "discarded", decided_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("status", "new");
  if (error) console.error("discard lead failed", error);
  revalidatePath("/", "layout");
}
