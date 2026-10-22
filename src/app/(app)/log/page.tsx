import Link from "next/link";
import { requireMfaSession } from "@/lib/auth/guard";
import { personOptions } from "@/lib/crm/lookups";
import LogForm, { type OpenJourney } from "./LogForm";

export default async function LogPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const { person } = await searchParams;
  const { supabase } = await requireMfaSession();

  const [people, { data: journeys }] = await Promise.all([
    personOptions(supabase),
    supabase.from("journeys").select("id, person_id, track, stage").eq("status", "open").not("person_id", "is", null),
  ]);

  const chosen = people.find((p) => p.id === person) ?? null;
  const open: OpenJourney[] = (journeys ?? []).map((j) => ({ ...j, person_id: j.person_id! }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{chosen ? `Log a touch with ${chosen.name}` : "Log a touch"}</h1>
      {people.length === 0 ? (
        <p className="card text-sm text-ink-soft">
          <Link href="/people/new" className="link">Add someone</Link> first, then log your touches with them.
        </p>
      ) : (
        <LogForm
          people={chosen ? [chosen] : people}
          journeys={open}
          initialPersonId={chosen?.id ?? null}
        />
      )}
    </div>
  );
}
