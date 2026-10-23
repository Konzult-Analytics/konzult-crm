import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { addDays } from "./dates";
import { oneToOnesPerWeek } from "./insights";
import { personName } from "./people";

type Client = SupabaseClient<Database>;

export const DEFAULT_ONE_TO_ONE_TARGET = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OneToOneTarget = { target: number; on: boolean };

/** The workspace's weekly one-to-one target; a missing settings row means the defaults. */
export async function oneToOneTarget(supabase: Client): Promise<OneToOneTarget> {
  const { data } = await supabase.from("workspace_settings").select("one_to_one_target, one_to_one_target_on").maybeSingle();
  return { target: data?.one_to_one_target ?? DEFAULT_ONE_TO_ONE_TARGET, on: data?.one_to_one_target_on ?? true };
}

export type ReferralRecord = {
  id: string;
  direction: string;
  member: string;
  memberId: string;
  contact: string;
  contactId: string | null;
  referred_on: string;
  temperature: number | null;
  status: string;
  closed_value: number | null;
  notes: string | null;
};

/** Every referral, or those involving one person (as the member or the one referred), newest first. */
export async function loadReferrals(supabase: Client, personId?: string): Promise<ReferralRecord[]> {
  // personId goes into a filter string, so it must be a plain uuid.
  if (personId !== undefined && !UUID.test(personId)) return [];
  const { data, error } = await fetchAll((from, to) => {
    const q = supabase
      .from("referrals")
      .select(
        "id, direction, referred_on, temperature, status, closed_value, notes, contact_name, member_person_id, contact_person_id, member:people!referrals_workspace_id_member_person_id_fkey(first_name, last_name), contact:people!referrals_workspace_id_contact_person_id_fkey(first_name, last_name)"
      )
      .order("referred_on", { ascending: false })
      .order("id")
      .range(from, to);
    return personId ? q.or(`member_person_id.eq.${personId},contact_person_id.eq.${personId}`) : q;
  });
  if (error) console.error("load referrals failed", error);
  return data.map((r) => ({
    id: r.id,
    direction: r.direction,
    member: r.member ? personName(r.member) : "Unknown member",
    memberId: r.member_person_id,
    contact: r.contact ? personName(r.contact) : (r.contact_name ?? "Someone"),
    contactId: r.contact_person_id,
    referred_on: r.referred_on,
    temperature: r.temperature,
    status: r.status,
    closed_value: r.closed_value,
    notes: r.notes,
  }));
}

/** BNI one-to-ones held so far this week (Monday to Sunday, South African time). */
export async function oneToOnesThisWeek(supabase: Client, today: string): Promise<number> {
  const { data, error } = await supabase
    .from("interactions")
    .select("type, direction, outcome, occurred_at, journey_id, meeting_setting")
    .eq("meeting_setting", "bni_one_to_one")
    .gte("occurred_at", `${addDays(today, -7)}T00:00:00+02:00`);
  if (error) console.error("one-to-ones this week failed", error);
  return oneToOnesPerWeek((data ?? []).map((t) => ({ ...t, campaign: null })), today, 1)[0].count;
}
