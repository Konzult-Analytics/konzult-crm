"use client";

import { useState, useTransition } from "react";
import { moveStage, reopenJourney } from "@/app/(app)/pipeline/actions";
import ExitForm, { type ExitStatus } from "@/components/ExitForm";
import { formatDate } from "@/lib/crm/dates";
import type { ExitReason } from "@/lib/crm/lookups";
import { STAGES, isTrack } from "@/lib/crm/stages";

export type JourneySummary = {
  id: string;
  track: string;
  stage: string;
  status: string;
  exit_reason: string | null;
  exit_side: string | null;
  parked_until: string | null;
};

export default function JourneyControls({ journey, reasons }: { journey: JourneySummary; reasons: ExitReason[] }) {
  const [closing, setClosing] = useState<ExitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error: string } | null>) =>
    startTransition(async () => {
      const result = await fn();
      setError(result?.error ?? null);
    });

  if (journey.status !== "open") {
    return (
      <div className="space-y-2 text-sm">
        <p>
          <span className={`badge ${journey.status === "lost" ? "badge-danger" : ""}`}>
            {journey.status === "lost" ? "Lost" : `Parked until ${formatDate(journey.parked_until)}`}
          </span>{" "}
          <span className="text-ink-soft">
            {journey.exit_reason}
            {journey.exit_side === "ours" ? " (our side)" : journey.exit_side === "theirs" ? " (their side)" : ""}
          </span>
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={() => run(() => reopenJourney(journey.id))}
        >
          {pending ? "Reopening…" : "Reopen"}
        </button>
        {error && <p className="text-danger">{error}</p>}
      </div>
    );
  }

  if (closing) {
    return (
      <ExitForm
        journeyId={journey.id}
        status={closing}
        reasons={reasons}
        onDone={() => setClosing(null)}
        onCancel={() => setClosing(null)}
      />
    );
  }

  const stages = isTrack(journey.track) ? STAGES[journey.track] : [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="field-label" htmlFor={`stage-${journey.id}`}>
            Stage
          </label>
          <select
            id={`stage-${journey.id}`}
            value={journey.stage}
            disabled={pending}
            onChange={(e) => {
              const stage = e.target.value;
              run(() => moveStage(journey.id, stage));
            }}
          >
            {stages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setClosing("parked")}>
          Park…
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setClosing("lost")}>
          Lost…
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
