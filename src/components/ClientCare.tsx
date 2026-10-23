"use client";

import { useActionState } from "react";
import { saveClientCare } from "@/app/(app)/pipeline/actions";
import SubmitButton from "@/components/SubmitButton";
import { CLIENT_STATUSES, REFERRAL_STATUSES, TESTIMONIAL_STATUSES, labelOf } from "@/lib/crm/labels";

export type CareValues = {
  client_status: string | null;
  testimonial_status: string | null;
  testimonial_quote: string | null;
  referral_status: string | null;
};

const NOT_ASKED = { key: "", label: "Not asked" };

export default function ClientCare({ journeyId, values }: { journeyId: string; values: CareValues }) {
  const [state, action] = useActionState(saveClientCare.bind(null, journeyId), null);
  const summary = [
    labelOf(CLIENT_STATUSES, values.client_status),
    values.testimonial_status && `testimonial ${labelOf(TESTIMONIAL_STATUSES, values.testimonial_status).toLowerCase()}`,
    values.referral_status && `referral ${labelOf(REFERRAL_STATUSES, values.referral_status).toLowerCase()}`,
  ].filter(Boolean);

  return (
    <details className="rounded-lg border border-line px-3 py-2">
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">Client care</span>
        {summary.length > 0 && <span className="text-ink-soft"> · {summary.join(" · ")}</span>}
      </summary>
      <form action={action} className="mt-3 space-y-4">
        <fieldset>
          <legend className="mb-1 text-sm">Status</legend>
          <div className="chips">
            {CLIENT_STATUSES.map((s) => (
              <label key={s.key} className="chip">
                <input type="radio" name="client_status" value={s.key} defaultChecked={values.client_status === s.key} required />
                {s.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Ended cancels the open care tasks. Switching back restarts the monthly check-in and payment check.
          </p>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm">Testimonial</legend>
          <div className="chips">
            {[NOT_ASKED, ...TESTIMONIAL_STATUSES].map((s) => (
              <label key={s.key} className="chip">
                <input
                  type="radio"
                  name="testimonial_status"
                  value={s.key}
                  defaultChecked={(values.testimonial_status ?? "") === s.key}
                />
                {s.label}
              </label>
            ))}
          </div>
          <label className="field-label" htmlFor={`quote-${journeyId}`}>
            Their words (use publicly only with their permission)
          </label>
          <textarea
            id={`quote-${journeyId}`}
            name="testimonial_quote"
            rows={3}
            maxLength={2000}
            defaultValue={values.testimonial_quote ?? ""}
          />
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm">Referral</legend>
          <div className="chips">
            {[NOT_ASKED, ...REFERRAL_STATUSES].map((s) => (
              <label key={s.key} className="chip">
                <input type="radio" name="referral_status" value={s.key} defaultChecked={(values.referral_status ?? "") === s.key} />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
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
