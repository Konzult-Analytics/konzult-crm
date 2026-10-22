import Link from "next/link";
import { requireMfaSession } from "@/lib/auth/guard";
import { daysAgo } from "@/lib/crm/dates";
import { personName } from "@/lib/crm/people";
import { stageLabel, TRACK_LABEL, isTrack } from "@/lib/crm/stages";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireMfaSession();

  const [{ data: people, error }, { data: journeys }] = await Promise.all([
    supabase
      .from("people")
      .select("id, first_name, last_name, email, phone, organisations(name)")
      .order("first_name"),
    supabase
      .from("journey_overview")
      .select("id, person_id, track, stage, status, last_touch_at")
      .not("person_id", "is", null),
  ]);
  if (error) console.error("people list failed", error);

  const needle = q.trim().toLowerCase();
  const rows = (people ?? [])
    .map((p) => {
      const own = (journeys ?? []).filter((j) => j.person_id === p.id);
      const lastTouch = own.map((j) => j.last_touch_at).filter(Boolean).sort().at(-1) ?? null;
      return { ...p, name: personName(p), organisation: p.organisations?.name ?? null, journeys: own, lastTouch };
    })
    .filter(
      (p) =>
        !needle ||
        [p.name, p.organisation, p.email, p.phone].some((v) => v?.toLowerCase().includes(needle))
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">People</h1>
        <Link href="/people/new" className="btn btn-accent btn-sm">
          Add someone
        </Link>
      </div>

      <form className="flex gap-2" role="search">
        <label className="sr-only" htmlFor="q">
          Search people
        </label>
        <input id="q" name="q" type="search" placeholder="Search name, business, email or number" defaultValue={q} />
        <button className="btn btn-ghost" type="submit">
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="card text-sm text-ink-soft">
          {needle ? (
            <>No one matches “{q}”.</>
          ) : (
            <>
              No one here yet. <Link href="/people/new" className="link">Add the first person</Link> you met at BNI.
            </>
          )}
        </div>
      ) : (
        <ul className="card divide-y divide-line p-0">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/people/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-paper">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.name}</span>
                  {p.organisation && <span className="block text-sm text-ink-soft">{p.organisation}</span>}
                </span>
                <span className="flex flex-wrap gap-1">
                  {p.journeys
                    .filter((j) => j.track && j.stage)
                    .map((j) => (
                      <span key={j.id} className={`badge ${j.status === "open" ? "badge-accent" : ""}`}>
                        {isTrack(j.track) ? TRACK_LABEL[j.track] : j.track}: {stageLabel(j.track!, j.stage!)}
                        {j.status !== "open" && ` (${j.status})`}
                      </span>
                    ))}
                </span>
                <span className="w-full text-xs text-ink-soft sm:w-auto">
                  {p.lastTouch ? `Last touch ${daysAgo(p.lastTouch)}` : "No touches yet"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
