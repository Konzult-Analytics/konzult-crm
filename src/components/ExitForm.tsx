"use client";

import { useActionState, useEffect, useRef } from "react";
import { closeJourney } from "@/app/(app)/pipeline/actions";
import SubmitButton from "@/components/SubmitButton";
import { addDays, saDate } from "@/lib/crm/dates";
import type { ExitReason } from "@/lib/crm/lookups";

export type ExitStatus = "lost" | "parked";

export default function ExitForm({
  journeyId,
  status,
  reasons,
  onDone,
  onCancel,
}: {
  journeyId: string;
  status: ExitStatus;
  reasons: ExitReason[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(closeJourney.bind(null, journeyId), null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state) onDone();
    wasPending.current = pending;
  }, [pending, state, onDone]);

  const theirs = reasons.filter((r) => r.side === "theirs");
  const ours = reasons.filter((r) => r.side === "ours");
  const tomorrow = addDays(saDate(), 1);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="status" value={status} />
      <div>
        <label className="field-label" htmlFor={`reason-${journeyId}`}>
          {status === "lost" ? "Why did it end?" : "Why not now?"}
        </label>
        <select id={`reason-${journeyId}`} name="exit_reason_id" required defaultValue="">
          <option value="" disabled>
            Pick a reason
          </option>
          <optgroup label="Their side">
            {theirs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Our side">
            {ours.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      {status === "parked" && (
        <div>
          <label className="field-label" htmlFor={`revisit-${journeyId}`}>
            Revisit on
          </label>
          <input id={`revisit-${journeyId}`} name="parked_until" type="date" min={tomorrow} required />
        </div>
      )}
      <div>
        <label className="field-label" htmlFor={`note-${journeyId}`}>
          Note (optional)
        </label>
        <textarea id={`note-${journeyId}`} name="exit_note" maxLength={2000} rows={2} />
      </div>
      {state?.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <SubmitButton pending="Saving…">{status === "lost" ? "Mark as lost" : "Park it"}</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
