"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/SubmitButton";
import type { PersonOption } from "@/lib/crm/lookups";
import { TRACK_LABEL, type Track } from "@/lib/crm/stages";
import { startJourney } from "../actions";

export default function StartJourneyForm({
  personId,
  tracks,
  sources,
  people,
}: {
  personId: string;
  tracks: Track[];
  sources: { id: string; label: string }[];
  people: PersonOption[];
}) {
  const [state, action] = useActionState(startJourney.bind(null, personId), null);
  return (
    <form action={action} className="space-y-3">
      <div className="chips" role="radiogroup" aria-label="Track">
        {tracks.map((t, i) => (
          <label key={t} className="chip">
            <input type="radio" name="track" value={t} defaultChecked={i === 0} />
            {TRACK_LABEL[t]} journey
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="start-source">
            Source
          </label>
          <select id="start-source" name="source_id" defaultValue="">
            <option value="">Not sure</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="start-referrer">
            Introduced by
          </label>
          <select id="start-referrer" name="referred_by_person_id" defaultValue="">
            <option value="">Nobody</option>
            {people
              .filter((p) => p.id !== personId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      {state?.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pending="Starting…" className="btn btn-ghost">
        Start journey
      </SubmitButton>
    </form>
  );
}
