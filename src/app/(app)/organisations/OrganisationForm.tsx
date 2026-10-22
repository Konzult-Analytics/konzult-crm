"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/SubmitButton";
import type { FormState } from "@/lib/crm/forms";
import { SIZE_BANDS, TURNOVER_BANDS } from "@/lib/crm/labels";

export type OrganisationValues = {
  name: string;
  industry: string | null;
  city: string | null;
  website: string | null;
  size_band: string | null;
  turnover_band: string | null;
  notes: string | null;
};

export default function OrganisationForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values?: OrganisationValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="org-name">
            Name
          </label>
          <input id="org-name" name="name" required maxLength={160} defaultValue={values?.name} />
        </div>
        <div>
          <label className="field-label" htmlFor="org-industry">
            Industry
          </label>
          <input id="org-industry" name="industry" maxLength={120} defaultValue={values?.industry ?? ""} />
        </div>
        <div>
          <label className="field-label" htmlFor="org-city">
            Town / city
          </label>
          <input id="org-city" name="city" maxLength={120} defaultValue={values?.city ?? ""} />
        </div>
        <div>
          <label className="field-label" htmlFor="org-website">
            Website
          </label>
          <input id="org-website" name="website" maxLength={300} defaultValue={values?.website ?? ""} />
        </div>
        <div>
          <label className="field-label" htmlFor="org-size">
            Size
          </label>
          <select id="org-size" name="size_band" defaultValue={values?.size_band ?? ""}>
            <option value="">Not sure</option>
            {SIZE_BANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="org-turnover">
            Turnover
          </label>
          <select id="org-turnover" name="turnover_band" defaultValue={values?.turnover_band ?? ""}>
            <option value="">Not sure</option>
            {TURNOVER_BANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="org-notes">
          Notes
        </label>
        <textarea id="org-notes" name="notes" maxLength={5000} defaultValue={values?.notes ?? ""} />
      </div>
      {state?.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pending="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
