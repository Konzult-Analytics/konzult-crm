"use client";

import { useActionState, useState } from "react";
import { addProposal, decideProposal } from "@/app/(app)/proposals/actions";
import SubmitButton from "@/components/SubmitButton";
import { addDays, formatDate, saDate } from "@/lib/crm/dates";
import type { ExitReason } from "@/lib/crm/lookups";
import { rands } from "@/lib/crm/money";

export type ProposalRow = {
  id: string;
  title: string;
  value: number;
  sent_on: string;
  status: string;
  decided_on: string | null;
  notes: string | null;
};

// The default first engagement (spec 11).
const DEFAULT_TITLE = "First phase";
const DEFAULT_VALUE = 7500;

export default function Proposals({
  journeyId,
  journeyOpen,
  proposals,
  reasons,
}: {
  journeyId: string;
  journeyOpen: boolean;
  proposals: ProposalRow[];
  reasons: ExitReason[];
}) {
  const waiting = proposals.filter((p) => p.status === "sent");
  const accepted = proposals.filter((p) => p.status === "accepted");
  const summary =
    proposals.length === 0
      ? "none yet"
      : [
          waiting.length > 0 && `${waiting.length} waiting (${rands(waiting.reduce((n, p) => n + p.value, 0))})`,
          accepted.length > 0 && `${accepted.length} accepted`,
          proposals.length - waiting.length - accepted.length > 0 &&
            `${proposals.length - waiting.length - accepted.length} declined`,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <details className="rounded-lg border border-line px-3 py-2" open={waiting.length > 0}>
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">Proposals</span> <span className="text-ink-soft">· {summary}</span>
      </summary>
      <div className="mt-3 space-y-3">
        {proposals.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {proposals.map((p) => (
              <ProposalItem key={p.id} proposal={p} journeyOpen={journeyOpen} reasons={reasons} />
            ))}
          </ul>
        )}
        <AddProposal journeyId={journeyId} />
      </div>
    </details>
  );
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  sent: { label: "Waiting", className: "badge" },
  accepted: { label: "Accepted", className: "badge badge-accent" },
  declined: { label: "Declined", className: "badge badge-danger" },
};

function ProposalItem({
  proposal: p,
  journeyOpen,
  reasons,
}: {
  proposal: ProposalRow;
  journeyOpen: boolean;
  reasons: ExitReason[];
}) {
  const [deciding, setDeciding] = useState<"accepted" | "declined" | null>(null);
  const [closeToo, setCloseToo] = useState(true);
  const [state, action] = useActionState(decideProposal.bind(null, p.id), null);
  const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.sent;

  return (
    <li className="space-y-2 py-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{p.title}</span>
        <span className="tabular-nums">{rands(p.value)}</span>
        <span className="text-ink-soft">sent {formatDate(p.sent_on)}</span>
        <span className={badge.className}>
          {badge.label}
          {p.decided_on && ` ${formatDate(p.decided_on)}`}
        </span>
      </p>
      {p.notes && <p className="whitespace-pre-line break-words text-ink-soft">{p.notes}</p>}

      {p.status === "sent" && !deciding && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeciding("accepted")}>
            Accepted
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeciding("declined")}>
            Declined…
          </button>
        </div>
      )}

      {p.status === "sent" && deciding && (
        <form action={action} className="space-y-3 rounded-lg bg-paper p-3">
          <input type="hidden" name="decision" value={deciding} />
          {deciding === "accepted" ? (
            <p>They become a client: the journey moves to Client and the care tasks are set up.</p>
          ) : (
            <>
              {journeyOpen && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="close"
                    checked={closeToo}
                    onChange={(e) => setCloseToo(e.target.checked)}
                  />
                  Also close the journey as lost
                </label>
              )}
              {journeyOpen && closeToo && (
                <div>
                  <label className="field-label" htmlFor={`decline-reason-${p.id}`}>
                    Why did it end?
                  </label>
                  <select id={`decline-reason-${p.id}`} name="exit_reason_id" required defaultValue="">
                    <option value="" disabled>
                      Pick a reason
                    </option>
                    {(["theirs", "ours"] as const).map((side) => (
                      <optgroup key={side} label={side === "theirs" ? "Their side" : "Our side"}>
                        {reasons
                          .filter((r) => r.side === side)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}
              {journeyOpen && closeToo && (
                <div>
                  <label className="field-label" htmlFor={`decline-note-${p.id}`}>
                    Note (optional)
                  </label>
                  <textarea id={`decline-note-${p.id}`} name="exit_note" rows={2} maxLength={2000} />
                </div>
              )}
            </>
          )}
          {state?.error && (
            <p className="text-danger" role="alert">
              {state.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending="Saving…" className="btn btn-accent btn-sm">
              {deciding === "accepted" ? "Confirm accepted" : "Confirm declined"}
            </SubmitButton>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeciding(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

function AddProposal({ journeyId }: { journeyId: string }) {
  const [state, action] = useActionState(addProposal.bind(null, journeyId), null);
  const today = saDate();
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Add a proposal</summary>
      <form action={action} className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor={`p-title-${journeyId}`}>
              What it&apos;s for
            </label>
            <input id={`p-title-${journeyId}`} name="title" required maxLength={120} defaultValue={DEFAULT_TITLE} />
          </div>
          <div>
            <label className="field-label" htmlFor={`p-value-${journeyId}`}>
              Value (R)
            </label>
            <input
              id={`p-value-${journeyId}`}
              name="value"
              type="number"
              min={0}
              max={100_000_000}
              step="any"
              inputMode="decimal"
              required
              defaultValue={DEFAULT_VALUE}
            />
          </div>
          <div>
            <label className="field-label" htmlFor={`p-sent-${journeyId}`}>
              Sent on
            </label>
            <input id={`p-sent-${journeyId}`} name="sent_on" type="date" max={today} required defaultValue={today} />
          </div>
          <div>
            <label className="field-label" htmlFor={`p-follow-${journeyId}`}>
              Follow up on (empty for none)
            </label>
            <input
              id={`p-follow-${journeyId}`}
              name="follow_up_on"
              type="date"
              min={today}
              defaultValue={addDays(today, 4)}
            />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor={`p-notes-${journeyId}`}>
            Notes (optional)
          </label>
          <textarea id={`p-notes-${journeyId}`} name="notes" rows={2} maxLength={2000} />
        </div>
        {state?.error && (
          <p className="text-danger" role="alert">
            {state.error}
          </p>
        )}
        <SubmitButton pending="Saving…" className="btn btn-ghost">
          Save proposal
        </SubmitButton>
      </form>
    </details>
  );
}
