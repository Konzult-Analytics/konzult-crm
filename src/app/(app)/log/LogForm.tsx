"use client";

import { useActionState, useMemo, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { addDays, saDate, saDateTimeLocal } from "@/lib/crm/dates";
import type { PersonOption } from "@/lib/crm/lookups";
import { MEETING_PURPOSES, MEETING_SETTINGS, OUTCOMES, TOUCH_TYPES, type TouchType } from "@/lib/crm/labels";
import { TRACK_LABEL, isTrack, stageLabel } from "@/lib/crm/stages";
import { logTouch } from "./actions";

export type OpenJourney = { id: string; person_id: string; track: string; stage: string };

const FOLLOW_UPS = [
  { days: 2, label: "In 2 days" },
  { days: 4, label: "In 4 days" },
  { days: 7, label: "Next week" },
];

export default function LogForm({
  people,
  journeys,
  initialPersonId,
}: {
  people: PersonOption[];
  journeys: OpenJourney[];
  initialPersonId: string | null;
}) {
  const [state, action] = useActionState(logTouch, null);
  const [personId, setPersonId] = useState(initialPersonId ?? "");
  const [filter, setFilter] = useState("");
  const [type, setType] = useState<TouchType>("whatsapp");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [outcome, setOutcome] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [followUpChosen, setFollowUpChosen] = useState(false);

  const today = saDate();
  const chooseFollowUp = (date: string) => {
    setFollowUpChosen(true);
    setFollowUp(date);
  };
  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle
      ? people.filter((p) => `${p.name} ${p.organisation ?? ""}`.toLowerCase().includes(needle))
      : people;
  }, [filter, people]);
  const personJourneys = journeys.filter((j) => j.person_id === personId);
  const isMessage = type !== "meeting" && type !== "note";
  // Spec 7: a message sent with no reply yet gets a follow-up in 4 days, unless you choose otherwise.
  const awaitingReply = isMessage && direction === "out" && (outcome === "" || outcome === "no_reply");
  const followUpOn = followUpChosen ? followUp : awaitingReply ? addDays(today, 4) : "";

  return (
    <form action={action} className="space-y-5">
      <div className="card space-y-3">
        <label className="field-label" htmlFor="person-filter">
          Who was it with?
        </label>
        {!initialPersonId && (
          <input
            id="person-filter"
            type="search"
            placeholder="Type a name or business"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
        <select
          aria-label="Person"
          name="person_id"
          required
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          size={initialPersonId ? undefined : Math.min(6, Math.max(2, matches.length + 1))}
        >
          <option value="" disabled>
            {matches.length ? "Pick a person" : "No one matches"}
          </option>
          {matches.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.organisation ? ` (${p.organisation})` : ""}
            </option>
          ))}
        </select>
        {personJourneys.length > 0 && (
          <div>
            <label className="field-label" htmlFor="journey_id">
              Journey
            </label>
            <select id="journey_id" name="journey_id" defaultValue={personJourneys[0].id} key={personId}>
              {personJourneys.map((j) => (
                <option key={j.id} value={j.id}>
                  {isTrack(j.track) ? TRACK_LABEL[j.track] : j.track}: {stageLabel(j.track, j.stage)}
                </option>
              ))}
              <option value="">Not about a journey</option>
            </select>
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <fieldset>
          <legend className="field-label">What kind of touch?</legend>
          <div className="chips">
            {TOUCH_TYPES.map((t) => (
              <label key={t.key} className="chip">
                <input
                  type="radio"
                  name="type"
                  value={t.key}
                  checked={type === t.key}
                  onChange={() => setType(t.key)}
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        {isMessage && (
          <fieldset>
            <legend className="field-label">Direction</legend>
            <div className="chips">
              <label className="chip">
                <input
                  type="radio"
                  name="direction"
                  value="out"
                  checked={direction === "out"}
                  onChange={() => setDirection("out")}
                />
                I reached out
              </label>
              <label className="chip">
                <input
                  type="radio"
                  name="direction"
                  value="in"
                  checked={direction === "in"}
                  onChange={() => setDirection("in")}
                />
                They reached out
              </label>
            </div>
          </fieldset>
        )}

        {type === "meeting" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="meeting_purpose">
                Purpose
              </label>
              <select id="meeting_purpose" name="meeting_purpose" defaultValue="sales">
                {MEETING_PURPOSES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="meeting_setting">
                Where
              </label>
              <select id="meeting_setting" name="meeting_setting" defaultValue="bni_one_to_one">
                {MEETING_SETTINGS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {type !== "note" && (
          <div>
            <label className="field-label" htmlFor="outcome">
              Outcome
            </label>
            <select id="outcome" name="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">No outcome yet</option>
              {OUTCOMES.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="summary">
            {type === "meeting" ? "What was discussed?" : "Notes"}
          </label>
          <textarea id="summary" name="summary" maxLength={10000} rows={type === "meeting" ? 5 : 3} />
        </div>

        <div>
          <label className="field-label" htmlFor="next_step">
            Agreed next step
          </label>
          <input id="next_step" name="next_step" maxLength={500} placeholder="e.g. Send The Map example" />
        </div>

        <div>
          <label className="field-label" htmlFor="occurred_at">
            When
          </label>
          <input
            id="occurred_at"
            name="occurred_at"
            type="datetime-local"
            required
            defaultValue={saDateTimeLocal()}
            className="sm:max-w-60"
          />
        </div>
      </div>

      <fieldset className="card space-y-3">
        <legend className="field-label">Follow up?</legend>
        {!followUpChosen && awaitingReply && (
          <p className="text-sm text-ink-soft">Pre-set to 4 days because they haven&apos;t replied yet. Pick “No” if you don&apos;t need it.</p>
        )}
        <div className="chips">
          <label className="chip">
            <input
              type="radio"
              name="follow_up_choice"
              checked={followUpOn === ""}
              onChange={() => chooseFollowUp("")}
            />
            No
          </label>
          {FOLLOW_UPS.map((f) => {
            const date = addDays(today, f.days);
            return (
              <label key={f.days} className="chip">
                <input
                  type="radio"
                  name="follow_up_choice"
                  checked={followUpOn === date}
                  onChange={() => chooseFollowUp(date)}
                />
                {f.label}
              </label>
            );
          })}
        </div>
        <div>
          <label className="field-label" htmlFor="follow_up_on">
            Or pick a date
          </label>
          <input
            id="follow_up_on"
            name="follow_up_on"
            type="date"
            min={today}
            value={followUpOn}
            onChange={(e) => chooseFollowUp(e.target.value)}
            className="sm:max-w-60"
          />
        </div>
      </fieldset>

      {state?.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pending="Saving…" className="btn btn-accent w-full sm:w-auto">
        Log touch
      </SubmitButton>
    </form>
  );
}
