"use client";

import { useActionState } from "react";
import { saveFit } from "@/app/(app)/pipeline/actions";
import SubmitButton from "@/components/SubmitButton";
import { STRONG_FIT } from "@/lib/crm/insights";

// Spec 3.4: four quick answers after the first sales meeting.
const QUESTIONS = [
  { name: "fit_need", label: "Do they have a problem we solve?", answers: ["Clearly", "Maybe", "No"] },
  { name: "fit_timing", label: "Will they act in the next 3 months?", answers: ["Yes", "Maybe", "No"] },
  { name: "fit_budget", label: "Does their size or budget fit?", answers: ["Yes", "Unsure", "No"] },
  { name: "fit_decision", label: "Were we speaking to the decision-maker?", answers: ["Yes", "Shared", "No"] },
] as const;
const VALUES = ["yes", "maybe", "no"] as const;

export type FitValues = {
  fit_need: string | null;
  fit_timing: string | null;
  fit_budget: string | null;
  fit_decision: string | null;
  fit_score: number | null;
  chance_pct: number | null;
  value_estimate: number | null;
};

export default function FitCheck({ journeyId, values }: { journeyId: string; values: FitValues }) {
  const [state, action] = useActionState(saveFit.bind(null, journeyId), null);
  const score = values.fit_score;
  return (
    <details className="rounded-lg border border-line px-3 py-2">
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">Fit and value</span>{" "}
        <span className="text-ink-soft">
          {score === null ? "· not checked yet" : `· fit ${score}/100 (${score >= STRONG_FIT ? "strong" : "weak"})`}
          {values.value_estimate !== null && ` · R${values.value_estimate.toLocaleString("en-ZA")}`}
          {values.chance_pct !== null && ` · ${values.chance_pct}% chance`}
        </span>
      </summary>
      <form action={action} className="mt-3 space-y-4">
        {QUESTIONS.map((q) => (
          <fieldset key={q.name}>
            <legend className="mb-1 text-sm">{q.label}</legend>
            <div className="chips">
              {q.answers.map((answer, i) => (
                <label key={answer} className="chip">
                  <input type="radio" name={q.name} value={VALUES[i]} defaultChecked={values[q.name] === VALUES[i]} />
                  {answer}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor={`value-${journeyId}`}>
              Deal value (R)
            </label>
            <input
              id={`value-${journeyId}`}
              name="value_estimate"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="e.g. 7500"
              defaultValue={values.value_estimate ?? ""}
            />
          </div>
          <div>
            <label className="field-label" htmlFor={`chance-${journeyId}`}>
              Your gut: chance to win (%)
            </label>
            <input
              id={`chance-${journeyId}`}
              name="chance_pct"
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              defaultValue={values.chance_pct ?? ""}
            />
          </div>
        </div>
        {state?.error && (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
        <SubmitButton pending="Saving…" className="btn btn-ghost">
          Save
        </SubmitButton>
      </form>
    </details>
  );
}
