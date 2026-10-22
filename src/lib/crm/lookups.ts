import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { personName } from "./people";

type Client = SupabaseClient<Database>;

export type PersonOption = { id: string; name: string; organisation: string | null };

export async function personOptions(supabase: Client): Promise<PersonOption[]> {
  const { data, error } = await supabase
    .from("people")
    .select("id, first_name, last_name, organisations(name)")
    .order("first_name");
  if (error) console.error("person options failed", error);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: personName(p),
    organisation: p.organisations?.name ?? null,
  }));
}

export async function sourceOptions(supabase: Client) {
  const { data, error } = await supabase
    .from("sources")
    .select("id, label")
    .eq("active", true)
    .order("sort_order");
  if (error) console.error("source options failed", error);
  return data ?? [];
}

export async function exitReasonOptions(supabase: Client) {
  const { data, error } = await supabase
    .from("exit_reasons")
    .select("id, label, side")
    .eq("active", true)
    .order("sort_order");
  if (error) console.error("exit reason options failed", error);
  return data ?? [];
}

export type ExitReason = Awaited<ReturnType<typeof exitReasonOptions>>[number];

export async function organisationNames(supabase: Client) {
  const { data, error } = await supabase.from("organisations").select("id, name").order("name");
  if (error) console.error("organisation names failed", error);
  return data ?? [];
}
