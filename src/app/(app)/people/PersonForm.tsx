"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/SubmitButton";
import type { FormState } from "@/lib/crm/forms";
import type { PersonOption } from "@/lib/crm/lookups";

export type PersonValues = {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  organisation: string | null;
  bni_chapter: string | null;
  is_bni_member: boolean;
  birthday: string | null;
  notes: string | null;
};

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values?: PersonValues;
  organisations: { id: string; name: string }[];
  /** Present when creating: the person can start a journey straight away. */
  journey?: { sources: { id: string; label: string }[]; people: PersonOption[] };
  submitLabel: string;
};

export default function PersonForm({ action, values, organisations, journey, submitLabel }: Props) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      <fieldset className="card space-y-4">
        <legend className="section-title px-1">Person</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="first_name">
              First name
            </label>
            <input id="first_name" name="first_name" required maxLength={80} defaultValue={values?.first_name} />
          </div>
          <div>
            <label className="field-label" htmlFor="last_name">
              Surname
            </label>
            <input id="last_name" name="last_name" maxLength={80} defaultValue={values?.last_name ?? ""} />
          </div>
          <div>
            <label className="field-label" htmlFor="phone">
              Cell / WhatsApp
            </label>
            <input id="phone" name="phone" type="tel" maxLength={40} defaultValue={values?.phone ?? ""} />
          </div>
          <div>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" maxLength={254} defaultValue={values?.email ?? ""} />
          </div>
          <div>
            <label className="field-label" htmlFor="organisation">
              Business
            </label>
            <input
              id="organisation"
              name="organisation"
              list="organisation-names"
              maxLength={160}
              placeholder="Type to pick or add"
              defaultValue={values?.organisation ?? ""}
            />
            <datalist id="organisation-names">
              {organisations.map((o) => (
                <option key={o.id} value={o.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="field-label" htmlFor="role_title">
              Role
            </label>
            <input id="role_title" name="role_title" maxLength={120} defaultValue={values?.role_title ?? ""} />
          </div>
          <div>
            <label className="field-label" htmlFor="bni_chapter">
              BNI chapter
            </label>
            <input id="bni_chapter" name="bni_chapter" maxLength={80} defaultValue={values?.bni_chapter ?? ""} />
          </div>
          <div>
            <label className="field-label" htmlFor="birthday">
              Birthday
            </label>
            <input id="birthday" name="birthday" type="date" defaultValue={values?.birthday ?? ""} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_bni_member" defaultChecked={values?.is_bni_member} />
          BNI member
        </label>
        <div>
          <label className="field-label" htmlFor="notes">
            Notes
          </label>
          <textarea id="notes" name="notes" maxLength={5000} defaultValue={values?.notes ?? ""} />
          <p className="mt-1 text-xs text-ink-soft">
            Keep out health, religion and other special personal information (POPIA).
          </p>
        </div>
      </fieldset>

      {journey && (
        <fieldset className="card space-y-4">
          <legend className="section-title px-1">Journey</legend>
          <div className="chips" role="radiogroup" aria-label="Track">
            <label className="chip">
              <input type="radio" name="track" value="client" defaultChecked />
              Possible client
            </label>
            <label className="chip">
              <input type="radio" name="track" value="partner" />
              Referral partner
            </label>
            <label className="chip">
              <input type="radio" name="track" value="none" />
              Just a contact
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="source_id">
                Where did they come from?
              </label>
              <select id="source_id" name="source_id" defaultValue="">
                <option value="">Not sure</option>
                {journey.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="referred_by_person_id">
                Introduced by
              </label>
              <select id="referred_by_person_id" name="referred_by_person_id" defaultValue="">
                <option value="">Nobody</option>
                {journey.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.organisation ? ` (${p.organisation})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>
      )}

      {state?.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pending="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
