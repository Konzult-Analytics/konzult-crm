import Link from "next/link";
import { requireMfaSession } from "@/lib/auth/guard";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createOrganisation } from "./actions";
import OrganisationForm from "./OrganisationForm";

export default async function OrganisationsPage() {
  const { supabase } = await requireMfaSession();
  const { data: organisations, error } = await fetchAll((from, to) =>
    supabase
      .from("organisations")
      .select("id, name, industry, city, people(count)")
      .order("name")
      .order("id")
      .range(from, to)
  );
  if (error) console.error("organisations list failed", error);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Organisations</h1>

      {(organisations ?? []).length === 0 ? (
        <p className="card text-sm text-ink-soft">
          No businesses yet. They&apos;re added automatically when you add someone with a business name, or add one
          below.
        </p>
      ) : (
        <ul className="card divide-y divide-line p-0">
          {(organisations ?? []).map((o) => (
            <li key={o.id}>
              <Link href={`/organisations/${o.id}`} className="flex flex-wrap items-center gap-x-3 px-4 py-3 hover:bg-paper">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{o.name}</span>
                  <span className="block text-sm text-ink-soft">
                    {[o.industry, o.city].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-sm text-ink-soft">
                  {o.people[0]?.count ?? 0} {o.people[0]?.count === 1 ? "person" : "people"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">Add an organisation</summary>
        <div className="mt-4">
          <OrganisationForm action={createOrganisation} submitLabel="Save organisation" />
        </div>
      </details>
    </div>
  );
}
