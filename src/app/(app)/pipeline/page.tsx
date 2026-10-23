import Link from "next/link";
import JourneyControls from "@/components/JourneyControls";
import { requireMfaSession } from "@/lib/auth/guard";
import { formatDate } from "@/lib/crm/dates";
import { exitReasonOptions } from "@/lib/crm/lookups";
import { STAGES, TRACKS, TRACK_LABEL, isTrack, stageLabel } from "@/lib/crm/stages";
import { fetchAll } from "@/lib/supabase/fetch-all";
import Board, { type BoardCard } from "./Board";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ track?: string }> }) {
  const { track: requested } = await searchParams;
  const track = isTrack(requested) ? requested : "client";
  const { supabase } = await requireMfaSession();

  const [{ data: journeys, error }, reasons] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("journey_overview")
        .select(
          "id, person_id, organisation_id, display_name, organisation_name, stage, status, source, last_touch_at, stage_changed_at, next_task_on, exit_reason, exit_side, exit_stage, parked_until, closed_at, fit_score, value_estimate, client_status"
        )
        .eq("track", track)
        .order("stage_changed_at")
        .order("id")
        .range(from, to)
    ),
    exitReasonOptions(supabase),
  ]);
  if (error) console.error("pipeline failed", error);

  const all = journeys ?? [];
  const cards: BoardCard[] = all
    .filter((j) => j.status === "open")
    .map((j) => ({
      id: j.id!,
      personId: j.person_id,
      organisationId: j.organisation_id,
      name: j.display_name ?? "Unnamed",
      organisation: j.organisation_name,
      stage: j.stage ?? "prospect",
      source: j.source,
      lastTouchAt: j.last_touch_at,
      stageChangedAt: j.stage_changed_at,
      nextTaskOn: j.next_task_on,
      fitScore: j.fit_score,
      value: j.value_estimate,
      clientStatus: j.client_status,
    }));
  const closed = all
    .filter((j) => j.status !== "open")
    .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <div className="chips" role="tablist" aria-label="Track">
          {TRACKS.map((t) => (
            <Link
              key={t}
              href={`/pipeline?track=${t}`}
              role="tab"
              aria-selected={t === track}
              className="chip"
            >
              {TRACK_LABEL[t]}s
            </Link>
          ))}
        </div>
      </div>

      {cards.length === 0 && closed.length === 0 ? (
        <p className="card text-sm text-ink-soft">
          No {track} journeys yet. <Link href="/people/new" className="link">Add someone</Link> and start a{" "}
          {track} journey.
        </p>
      ) : (
        <Board columns={STAGES[track]} cards={cards} reasons={reasons} />
      )}

      {closed.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium">
            Parked and lost ({closed.length})
          </summary>
          <ul className="mt-3 divide-y divide-line">
            {closed.map((j) => (
              <li key={j.id} className="space-y-2 py-3">
                <p className="text-sm">
                  <Link
                    href={j.person_id ? `/people/${j.person_id}` : `/organisations/${j.organisation_id}`}
                    className="font-medium hover:underline"
                  >
                    {j.display_name}
                  </Link>{" "}
                  <span className="text-ink-soft">
                    left at {stageLabel(track, j.exit_stage ?? "")} on {formatDate(j.closed_at)}
                  </span>
                </p>
                <JourneyControls
                  journey={{
                    id: j.id!,
                    track,
                    stage: j.stage ?? "",
                    status: j.status ?? "lost",
                    exit_reason: j.exit_reason,
                    exit_side: j.exit_side,
                    parked_until: j.parked_until,
                  }}
                  reasons={reasons}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
