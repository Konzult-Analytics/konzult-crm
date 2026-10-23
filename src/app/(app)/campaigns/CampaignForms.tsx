"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { saDate } from "@/lib/crm/dates";
import { CAMPAIGN_CHANNELS } from "@/lib/crm/labels";
import { BOOKING_TYPE_ROWS, type BookingType } from "@/lib/crm/booking-links";
import { saveBookingSettings, saveCampaign, saveTarget } from "./actions";

export type CampaignValues = {
  id: string;
  name: string;
  track: string;
  channel: string | null;
  started_on: string | null;
  message: string | null;
  notes: string | null;
  active: boolean;
};

export function CampaignForm({ campaign }: { campaign: CampaignValues | null }) {
  const [state, action] = useActionState(saveCampaign.bind(null, campaign?.id ?? null), null);
  const key = campaign?.id ?? "new";
  return (
    <form action={action} className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor={`c-name-${key}`}>
            Name
          </label>
          <input id={`c-name-${key}`} name="name" required maxLength={120} defaultValue={campaign?.name ?? ""} />
        </div>
        <div>
          <label className="field-label" htmlFor={`c-track-${key}`}>
            Aimed at
          </label>
          <select id={`c-track-${key}`} name="track" defaultValue={campaign?.track ?? "client"}>
            <option value="client">Clients</option>
            <option value="partner">Partners</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={`c-channel-${key}`}>
            Channel
          </label>
          <select id={`c-channel-${key}`} name="channel" defaultValue={campaign?.channel ?? ""}>
            <option value="">Not set</option>
            {CAMPAIGN_CHANNELS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={`c-start-${key}`}>
            Started
          </label>
          <input id={`c-start-${key}`} name="started_on" type="date" defaultValue={campaign?.started_on ?? saDate()} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" name="active" defaultChecked={campaign?.active ?? true} />
          Running (shows when you log or send)
        </label>
      </div>
      <div>
        <label className="field-label" htmlFor={`c-message-${key}`}>
          The message you&apos;re sending (optional)
        </label>
        <textarea id={`c-message-${key}`} name="message" rows={4} maxLength={4000} defaultValue={campaign?.message ?? ""} />
      </div>
      <div>
        <label className="field-label" htmlFor={`c-notes-${key}`}>
          Notes
        </label>
        <textarea id={`c-notes-${key}`} name="notes" rows={2} maxLength={2000} defaultValue={campaign?.notes ?? ""} />
      </div>
      {state?.error && (
        <p className="text-danger" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pending="Saving…" className="btn btn-ghost">
        {campaign ? "Save campaign" : "Add campaign"}
      </SubmitButton>
    </form>
  );
}

export function BookingSettingsForm({ page, types }: { page: string | null; types: BookingType[] }) {
  const [state, action] = useActionState(saveBookingSettings, null);
  const rows = Array.from({ length: BOOKING_TYPE_ROWS }, (_, i) => types[i] ?? { label: "", slug: "" });
  return (
    <form action={action} className="space-y-3 text-sm">
      <div>
        <label className="field-label" htmlFor="booking_page_url">
          Your Cal.com page
        </label>
        <input
          id="booking_page_url"
          name="booking_page_url"
          type="url"
          maxLength={200}
          placeholder="https://cal.com/your-name"
          defaultValue={page ?? ""}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="field-label">Event types (name, and the last part of its Cal.com link)</legend>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <input name={`label_${i}`} aria-label={`Event ${i + 1} name`} maxLength={60} placeholder="Discovery call" defaultValue={r.label} />
            <input name={`slug_${i}`} aria-label={`Event ${i + 1} link name`} maxLength={100} placeholder="discovery-call" defaultValue={r.slug} />
          </div>
        ))}
      </fieldset>
      <SubmitButton pending="Saving…" className="btn btn-ghost">
        Save
      </SubmitButton>
      {state?.error && (
        <p className="text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function TargetForm({ target, on }: { target: number; on: boolean }) {
  const [state, action] = useActionState(saveTarget, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex items-center gap-2 pb-2">
        <input type="checkbox" name="one_to_one_target_on" defaultChecked={on} />
        Track a weekly target
      </label>
      <div>
        <label className="field-label" htmlFor="target">
          One-to-ones per week
        </label>
        <input id="target" name="one_to_one_target" type="number" min={1} max={50} step={1} required defaultValue={target} className="w-24" />
      </div>
      <SubmitButton pending="Saving…" className="btn btn-ghost">
        Save
      </SubmitButton>
      {state?.error && (
        <p className="w-full text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
