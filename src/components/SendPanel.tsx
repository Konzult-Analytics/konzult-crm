"use client";

import { useState, useTransition } from "react";
import { prepareSend } from "@/app/(app)/people/send-actions";
import { mergeFields, sendBlock, sendPurpose, swapBookingLink, type Purpose } from "@/lib/crm/messages";

export type SendTemplate = { id: string; name: string; purpose: string; subject: string | null; body: string };
export type SendDocument = { id: string; title: string; kind: string; is_library: boolean };

const PURPOSE_NOTE: Record<Purpose, string> = {
  personal: "Personal message.",
  marketing: "Marketing message: the opt-out line is added for you.",
  consent_request: "Consent request: POPIA allows one.",
};

export default function SendPanel({
  personId,
  firstName,
  fullName,
  business,
  hasEmail,
  hasWhatsApp,
  consent,
  isClient,
  consentRequestSent,
  templates,
  documents,
  campaigns,
  bookingLinks,
}: {
  personId: string;
  firstName: string;
  fullName: string;
  business: string | null;
  hasEmail: boolean;
  hasWhatsApp: boolean;
  consent: string;
  isClient: boolean;
  consentRequestSent: boolean;
  templates: SendTemplate[];
  documents: SendDocument[];
  campaigns: { id: string; name: string }[];
  /** This person's pre-filled Cal.com links, one per event type. */
  bookingLinks: { label: string; url: string }[];
}) {
  const ctx = { firstName, fullName, business };
  const [templateId, setTemplateId] = useState("");
  const [bookingLink, setBookingLink] = useState<string | null>(null);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{ error?: string; href?: string; text?: string; channel?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const template = templates.find((t) => t.id === templateId) ?? null;
  const purpose = sendPurpose(
    (template?.purpose as Purpose | undefined) ?? null,
    documents.filter((d) => docIds.includes(d.id)).map((d) => d.kind)
  );
  const recipient = { consent, isClient, consentRequestSent };
  const blocked = sendBlock(purpose, recipient);

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(mergeFields(t.subject ?? "", ctx));
      // A template asking for {booking_link} gets the first event type's link, which can be changed below.
      const link = t.body.includes("{booking_link}") ? (bookingLinks[0]?.url ?? null) : null;
      setBody(swapBookingLink(mergeFields(t.body, ctx), null, link));
      setBookingLink(link);
    }
    setResult(null);
  };

  const chooseBookingLink = (url: string) => {
    const next = url || null;
    setBody((b) => swapBookingLink(b, bookingLink, next));
    setBookingLink(next);
  };

  const send = (channel: "email" | "whatsapp") =>
    startTransition(async () => {
      const res = await prepareSend({
        person_id: personId,
        template_id: templateId || null,
        campaign_id: campaignId || null,
        document_ids: docIds,
        channel,
        subject,
        body,
      });
      if ("error" in res) {
        setResult({ error: res.error });
        return;
      }
      setResult({ href: res.href, text: res.text, channel });
      if (channel === "email") window.location.href = res.href;
      else window.open(res.href, "_blank", "noopener");
    });

  const library = documents.filter((d) => d.is_library);
  const own = documents.filter((d) => !d.is_library);

  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-medium">Send a message or material</summary>
      <div className="mt-4 space-y-4 text-sm">
        <div>
          <label className="field-label" htmlFor={`template-${personId}`}>
            Template
          </label>
          <select id={`template-${personId}`} value={templateId} onChange={(e) => chooseTemplate(e.target.value)}>
            <option value="">None: write your own</option>
            {templates.map((t) => {
              const reason = sendBlock(sendPurpose(t.purpose as Purpose, []), recipient);
              return (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {reason ? " (not available for them)" : ""}
                </option>
              );
            })}
          </select>
        </div>

        {documents.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="field-label">Include a personal link to</legend>
            {[
              { label: "From the library", items: library },
              { label: "Their documents", items: own },
            ]
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.label} className="space-y-1">
                  <p className="text-xs text-ink-soft">{g.label}</p>
                  {g.items.map((d) => (
                    <label key={d.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={docIds.includes(d.id)}
                        onChange={(e) =>
                          setDocIds((ids) => (e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id)))
                        }
                      />
                      {d.title}
                    </label>
                  ))}
                </div>
              ))}
          </fieldset>
        )}

        {bookingLinks.length > 0 && (
          <div>
            <label className="field-label" htmlFor={`booking-${personId}`}>
              Booking link (optional)
            </label>
            <select id={`booking-${personId}`} value={bookingLink ?? ""} onChange={(e) => chooseBookingLink(e.target.value)}>
              <option value="">No booking link</option>
              {bookingLinks.map((l) => (
                <option key={l.url} value={l.url}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-soft">
              Their details are filled in on your Cal.com page, so booking takes them one tap.
            </p>
          </div>
        )}

        {campaigns.length > 0 && (
          <div>
            <label className="field-label" htmlFor={`campaign-${personId}`}>
              Campaign (optional)
            </label>
            <select id={`campaign-${personId}`} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Not part of a campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="field-label" htmlFor={`subject-${personId}`}>
            Subject (email only)
          </label>
          <input id={`subject-${personId}`} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor={`body-${personId}`}>
            Message
          </label>
          <textarea
            id={`body-${personId}`}
            rows={8}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Hi ${firstName}`}
          />
          <p className="mt-1 text-xs text-ink-soft">
            {"{links}"} becomes one personal link per ticked document; without it, the links go at the end.
          </p>
        </div>

        <p className={blocked ? "text-danger" : "text-ink-soft"} role={blocked ? "alert" : undefined}>
          {blocked ?? PURPOSE_NOTE[purpose]}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-accent btn-sm"
            disabled={pending || !!blocked || !body.trim() || !hasEmail}
            title={hasEmail ? undefined : "Add their email address first"}
            onClick={() => send("email")}
          >
            {pending ? "Preparing…" : "Open in email"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending || !!blocked || !body.trim() || !hasWhatsApp}
            title={hasWhatsApp ? undefined : "Add their cell number first"}
            onClick={() => send("whatsapp")}
          >
            Open in WhatsApp
          </button>
        </div>

        {result?.error && (
          <p className="text-danger" role="alert">
            {result.error}
          </p>
        )}
        {result?.href && (
          <div className="space-y-2 rounded-lg bg-paper p-3" role="status">
            <p>
              Logged as a touch. If {result.channel === "email" ? "your email app" : "WhatsApp"} didn&apos;t open,{" "}
              <a href={result.href} target="_blank" rel="noreferrer" className="link">
                open it here
              </a>{" "}
              or copy the message:
            </p>
            <textarea readOnly rows={6} value={result.text} onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}
      </div>
    </details>
  );
}
