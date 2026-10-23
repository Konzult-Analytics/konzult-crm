"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { BOOKING_TYPE_ROWS, bookingPageSchema, bookingTypeSchema, type BookingType } from "@/lib/crm/booking-links";
import { saDate } from "@/lib/crm/dates";
import { findOrCreateOrganisation } from "@/lib/crm/organisations";
import {
  checkbox,
  fields,
  optionalDate,
  optionalEmail,
  optionalEnum,
  optionalText,
  optionalUuid,
  requiredDate,
  requiredText,
  type FormState,
} from "@/lib/crm/forms";
import { BNI_REFERRAL_STATUSES, CAMPAIGN_CHANNELS, keysOf } from "@/lib/crm/labels";

const campaignSchema = z.object({
  name: requiredText(120),
  track: z.enum(["client", "partner"]),
  channel: optionalEnum(keysOf(CAMPAIGN_CHANNELS)),
  started_on: optionalDate,
  message: optionalText(4000),
  notes: optionalText(2000),
  active: checkbox,
});

/** Creates a campaign (campaignId null) or saves changes to one. */
export async function saveCampaign(campaignId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  if (campaignId !== null && !z.uuid().safeParse(campaignId).success) return { error: "That campaign no longer exists." };
  const parsed = campaignSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "A campaign needs a name and a track." };

  const { error } = campaignId
    ? await supabase.from("campaigns").update(parsed.data).eq("id", campaignId)
    : await supabase.from("campaigns").insert(parsed.data);
  if (error) {
    console.error("save campaign failed", error);
    return { error: "Couldn't save the campaign. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}

/** The Cal.com booking page and the event types the CRM offers (Book buttons, QR codes). */
export async function saveBookingSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  const rawPage = String(formData.get("booking_page_url") ?? "").trim();
  const page = rawPage ? bookingPageSchema.safeParse(rawPage) : null;
  if (page && !page.success) return { error: "The booking page is your Cal.com address, starting https://" };

  const types: BookingType[] = [];
  for (let i = 0; i < BOOKING_TYPE_ROWS; i++) {
    const label = String(formData.get(`label_${i}`) ?? "").trim();
    const slug = String(formData.get(`slug_${i}`) ?? "").trim();
    if (!label && !slug) continue;
    const parsed = bookingTypeSchema.safeParse({ label, slug });
    if (!parsed.success) return { error: `Row ${i + 1}: give a name and the event's link name (e.g. discovery-call).` };
    if (types.some((t) => t.slug === parsed.data.slug)) return { error: `"${parsed.data.slug}" is listed twice.` };
    types.push(parsed.data);
  }

  const values = { booking_page_url: page?.data ?? null, booking_types: page ? types : [] };
  const { data: existing } = await supabase.from("workspace_settings").select("workspace_id").maybeSingle();
  const { error } = existing
    ? await supabase.from("workspace_settings").update(values).eq("workspace_id", existing.workspace_id)
    : await supabase.from("workspace_settings").insert(values);
  if (error) {
    console.error("save booking settings failed", error);
    return { error: "Couldn't save the booking links. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}

const targetSchema = z.object({
  one_to_one_target: z.coerce.number().int().min(1).max(50),
  one_to_one_target_on: checkbox,
});

/** The weekly BNI one-to-one target: a number, and whether to track it at all. */
export async function saveTarget(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  const parsed = targetSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "The target is a whole number from 1 to 50." };

  const { data: existing } = await supabase.from("workspace_settings").select("workspace_id").maybeSingle();
  const { error } = existing
    ? await supabase.from("workspace_settings").update(parsed.data).eq("workspace_id", existing.workspace_id)
    : await supabase.from("workspace_settings").insert(parsed.data);
  if (error) {
    console.error("save target failed", error);
    return { error: "Couldn't save the target. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}

const referralSchema = z.object({
  direction: z.enum(["given", "received"]),
  member_person_id: z.uuid(),
  contact_person_id: optionalUuid,
  first_name: optionalText(80),
  last_name: optionalText(80),
  business: optionalText(160),
  phone: optionalText(40),
  email: optionalEmail,
  referred_on: requiredDate,
  temperature: optionalEnum(["1", "2", "3", "4", "5"]),
  notes: optionalText(2000),
});

/**
 * Given: a lead Zander passed to a member (the person may not be in the CRM).
 * Received: a lead a member passed to Zander. That person is added if new and
 * gets a client journey (source Referral, introduced by the member), which the
 * referral then follows.
 */
export async function addReferral(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  const parsed = referralSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "Pick the member, who was referred, and the date. Emails must be valid." };
  const r = parsed.data;
  if (r.referred_on > saDate()) return { error: "The referral date can't be in the future." };
  const contactName = [r.first_name, r.last_name].filter(Boolean).join(" ") || null;
  if (!r.contact_person_id && !contactName) return { error: "Who was referred? Pick someone or type their name." };
  if (r.contact_person_id === r.member_person_id) return { error: "The member and the person referred must be different people." };

  let contactId = r.contact_person_id;
  let journeyId: string | null = null;
  if (r.direction === "received") {
    if (!contactId) {
      const organisation_id = r.business ? await findOrCreateOrganisation(supabase, r.business) : null;
      const { data: person, error } = await supabase
        .from("people")
        .insert({ first_name: r.first_name ?? contactName!, last_name: r.last_name, phone: r.phone, email: r.email, organisation_id })
        .select("id")
        .single();
      if (error || !person) {
        console.error("referral: add person failed", error);
        return { error: "Couldn't add the person who was referred. Try again." };
      }
      contactId = person.id;
    }
    const { data: open } = await supabase
      .from("journeys")
      .select("id")
      .eq("person_id", contactId)
      .eq("track", "client")
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (open) {
      journeyId = open.id;
    } else {
      const { data: source } = await supabase.from("sources").select("id").eq("label", "Referral").maybeSingle();
      const { data: journey, error } = await supabase
        .from("journeys")
        .insert({ track: "client", person_id: contactId, source_id: source?.id ?? null, referred_by_person_id: r.member_person_id })
        .select("id")
        .single();
      if (error || !journey) {
        console.error("referral: start journey failed", error);
        return { error: "Couldn't start their client journey. Try again." };
      }
      journeyId = journey.id;
    }
  }

  const { error } = await supabase.from("referrals").insert({
    direction: r.direction,
    member_person_id: r.member_person_id,
    contact_person_id: contactId,
    contact_name: contactId ? null : contactName,
    journey_id: journeyId,
    referred_on: r.referred_on,
    temperature: r.temperature ? Number(r.temperature) : null,
    notes: r.notes,
  });
  if (error) {
    console.error("add referral failed", error);
    return { error: "Couldn't save the referral. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}

const updateSchema = z.object({
  status: z.enum(keysOf(BNI_REFERRAL_STATUSES)),
  closed_value: z
    .union([z.literal(""), z.coerce.number().min(0).max(100_000_000)])
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Math.round(v * 100) / 100)),
  notes: optionalText(2000),
});

/** Status and the Rand value of the business it brought (TYFCB). */
export async function updateReferral(referralId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  if (!z.uuid().safeParse(referralId).success) return { error: "That referral no longer exists." };
  const parsed = updateSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "The value must be a positive number in rand." };
  const { data: current } = await supabase.from("referrals").select("closed_on").eq("id", referralId).maybeSingle();
  if (!current) return { error: "That referral no longer exists." };
  const closed = parsed.data.status === "won" || parsed.data.status === "lost";
  const { error } = await supabase
    .from("referrals")
    .update({ ...parsed.data, closed_on: closed ? (current.closed_on ?? saDate()) : null })
    .eq("id", referralId);
  if (error) {
    console.error("update referral failed", error);
    return { error: "Couldn't save the referral. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}
