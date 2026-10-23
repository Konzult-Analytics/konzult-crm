"use client";

import { useActionState, useState } from "react";
import { addReferral, updateReferral } from "@/app/(app)/campaigns/actions";
import SubmitButton from "@/components/SubmitButton";
import type { ReferralRecord as ReferralRow } from "@/lib/crm/bni";
import { formatDate, saDate } from "@/lib/crm/dates";
import { BNI_REFERRAL_STATUSES, TEMPERATURES, labelOf } from "@/lib/crm/labels";
import type { PersonOption } from "@/lib/crm/lookups";
import { rands } from "@/lib/crm/money";


/** Record a referral. On a member's page the member is fixed. */
export function ReferralForm({ people, memberId }: { people: PersonOption[]; memberId?: string }) {
  const [state, action] = useActionState(addReferral, null);
  const [direction, setDirection] = useState<"received" | "given">("received");
  const [contactId, setContactId] = useState("");
  const members = people.filter((p) => p.isBniMember);
  const others = people.filter((p) => !p.isBniMember);
  const key = memberId ?? "any";

  const options = (list: PersonOption[]) =>
    list.map((p) => (
      <option key={p.id} value={p.id}>
        {p.name}
        {p.organisation ? ` (${p.organisation})` : ""}
      </option>
    ));

  return (
    <form action={action} className="space-y-3 text-sm">
      <fieldset>
        <legend className="field-label">Which way?</legend>
        <div className="chips">
          <label className="chip">
            <input
              type="radio"
              name="direction"
              value="received"
              checked={direction === "received"}
              onChange={() => setDirection("received")}
            />
            They referred someone to me
          </label>
          <label className="chip">
            <input type="radio" name="direction" value="given" checked={direction === "given"} onChange={() => setDirection("given")} />
            I referred someone to them
          </label>
        </div>
      </fieldset>

      {memberId ? (
        <input type="hidden" name="member_person_id" value={memberId} />
      ) : (
        <div>
          <label className="field-label" htmlFor={`r-member-${key}`}>
            BNI member
          </label>
          <select id={`r-member-${key}`} name="member_person_id" required defaultValue="">
            <option value="" disabled>
              Pick the member
            </option>
            {members.length > 0 && <optgroup label="BNI members">{options(members)}</optgroup>}
            <optgroup label="Everyone else">{options(others)}</optgroup>
          </select>
        </div>
      )}

      <div>
        <label className="field-label" htmlFor={`r-contact-${key}`}>
          Who was referred?
        </label>
        <select id={`r-contact-${key}`} name="contact_person_id" value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">Someone new (type their details below)</option>
          {options(people.filter((p) => p.id !== memberId))}
        </select>
      </div>
      {!contactId && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor={`r-first-${key}`}>
              First name
            </label>
            <input id={`r-first-${key}`} name="first_name" maxLength={80} required />
          </div>
          <div>
            <label className="field-label" htmlFor={`r-last-${key}`}>
              Last name
            </label>
            <input id={`r-last-${key}`} name="last_name" maxLength={80} />
          </div>
          {direction === "received" && (
            <>
              <div>
                <label className="field-label" htmlFor={`r-business-${key}`}>
                  Business
                </label>
                <input id={`r-business-${key}`} name="business" maxLength={160} />
              </div>
              <div>
                <label className="field-label" htmlFor={`r-phone-${key}`}>
                  Cell
                </label>
                <input id={`r-phone-${key}`} name="phone" type="tel" maxLength={40} />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor={`r-email-${key}`}>
                  Email
                </label>
                <input id={`r-email-${key}`} name="email" type="email" maxLength={254} />
              </div>
            </>
          )}
        </div>
      )}
      {direction === "received" && (
        <p className="text-xs text-ink-soft">
          They get a client journey (source Referral, introduced by the member). The referral follows it: in contact, business
          closed (with the deal value) or didn&apos;t happen. Record that they agreed to be contacted (POPIA) in the notes.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor={`r-date-${key}`}>
            Date
          </label>
          <input id={`r-date-${key}`} name="referred_on" type="date" required max={saDate()} defaultValue={saDate()} />
        </div>
        <div>
          <label className="field-label" htmlFor={`r-temp-${key}`}>
            Temperature
          </label>
          <select id={`r-temp-${key}`} name="temperature" defaultValue="">
            <option value="">Not set</option>
            {TEMPERATURES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor={`r-notes-${key}`}>
          Notes
        </label>
        <textarea id={`r-notes-${key}`} name="notes" rows={2} maxLength={2000} />
      </div>
      {state?.error && (
        <p className="text-danger" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pending="Saving…" className="btn btn-ghost">
        Save referral
      </SubmitButton>
    </form>
  );
}

export function ReferralList({ referrals, linkPeople = true }: { referrals: ReferralRow[]; linkPeople?: boolean }) {
  if (referrals.length === 0) return <p className="text-sm text-ink-soft">No referrals recorded yet.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {referrals.map((r) => (
        <ReferralItem key={r.id} referral={r} linkPeople={linkPeople} />
      ))}
    </ul>
  );
}

function ReferralItem({ referral: r, linkPeople }: { referral: ReferralRow; linkPeople: boolean }) {
  const [state, action] = useActionState(updateReferral.bind(null, r.id), null);
  const person = (name: string, id: string | null) =>
    linkPeople && id ? (
      <a href={`/people/${id}`} className="link">
        {name}
      </a>
    ) : (
      <span>{name}</span>
    );
  return (
    <li className="space-y-2 py-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`badge ${r.direction === "received" ? "badge-accent" : ""}`}>
          {r.direction === "received" ? "Received" : "Given"}
        </span>
        {r.direction === "received" ? (
          <span>
            {person(r.member, r.memberId)} referred {person(r.contact, r.contactId)}
          </span>
        ) : (
          <span>
            I referred {person(r.contact, r.contactId)} to {person(r.member, r.memberId)}
          </span>
        )}
      </p>
      <p className="text-xs text-ink-soft">
        {formatDate(r.referred_on)}
        {r.temperature && ` · temperature ${r.temperature}`} · {labelOf(BNI_REFERRAL_STATUSES, r.status)}
        {r.status === "won" && r.closed_value !== null && ` · ${rands(r.closed_value)}`}
      </p>
      {r.notes && <p className="whitespace-pre-line break-words text-ink-soft">{r.notes}</p>}
      <details>
        <summary className="cursor-pointer text-xs">Update</summary>
        <form action={action} className="mt-2 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="field-label" htmlFor={`rs-${r.id}`}>
              Status
            </label>
            <select id={`rs-${r.id}`} name="status" defaultValue={r.status}>
              {BNI_REFERRAL_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={`rv-${r.id}`}>
              {r.direction === "given" ? "Business they closed (R)" : "Business you closed (R)"}
            </label>
            <input
              id={`rv-${r.id}`}
              name="closed_value"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              defaultValue={r.closed_value ?? ""}
            />
          </div>
          <div className="sm:col-span-3">
            <label className="field-label" htmlFor={`rn-${r.id}`}>
              Notes
            </label>
            <textarea id={`rn-${r.id}`} name="notes" rows={2} maxLength={2000} defaultValue={r.notes ?? ""} />
          </div>
          {state?.error && (
            <p className="text-danger sm:col-span-3" role="alert">
              {state.error}
            </p>
          )}
          <div className="sm:col-span-3">
            <SubmitButton pending="Saving…" className="btn btn-ghost btn-sm">
              Save
            </SubmitButton>
          </div>
        </form>
      </details>
    </li>
  );
}
