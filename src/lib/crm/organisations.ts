import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** The organisation with this name (any capitalisation), created if it doesn't exist yet. */
export async function findOrCreateOrganisation(
  supabase: SupabaseClient<Database>,
  name: string
): Promise<string | null> {
  const wanted = name.trim().toLowerCase();
  const find = async () => {
    const { data } = await supabase.from("organisations").select("id, name");
    return data?.find((o) => o.name.trim().toLowerCase() === wanted)?.id ?? null;
  };

  const existing = await find();
  if (existing) return existing;

  const { data, error } = await supabase.from("organisations").insert({ name: name.trim() }).select("id").single();
  if (data) return data.id;
  // Saved a moment ago under different capitalisation (unique on lower(name)).
  if (error?.code === "23505") return find();
  console.error("create organisation failed", error);
  return null;
}
