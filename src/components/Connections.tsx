"use client";

import { useActionState, useState } from "react";
import { createConnection, revokeConnection, type NewConnection } from "@/app/(app)/inbound/actions";
import { formatDateTime } from "@/lib/crm/dates";

export type ConnectionRow = {
  id: string;
  kind: string;
  key_hint: string;
  created_at: string;
  revoked_at: string | null;
  last_event_at: string | null;
  last_event_status: string | null;
};

const KINDS = {
  cal: {
    title: "Cal.com bookings",
    steps: [
      "In Cal.com, open Settings → Developer → Webhooks → New.",
      "Paste the address below as the Subscriber URL, and the key as the Secret.",
      "Tick Booking created, Booking rescheduled and Booking cancelled. Save.",
      "Press Ping test. This page then shows “Last event: ping”.",
    ],
  },
  website: {
    title: "Website enquiries",
    steps: [
      "In Framer, open the contact form → Send To → Webhook.",
      "Paste the address below as the URL, and the key as the Secret.",
      "Name the fields name, email, phone, business, message and marketing_consent (an unticked box), plus a hidden field called website for spam.",
      "Submit a test enquiry. It appears under New enquiries on Today.",
    ],
  },
} as const;

const STATUS: Record<string, string> = {
  booked: "booking received",
  rescheduled: "booking moved",
  cancelled: "booking cancelled",
  duplicate: "repeat delivery (already had it)",
  received: "enquiry received",
  ping: "ping",
  ignored: "something it doesn't need (ignored)",
  bad_signature: "signature didn't match: check the key in the sender's settings",
  spam: "spam caught",
};

export default function Connections({ connections }: { connections: ConnectionRow[] }) {
  return (
    <div className="space-y-4">
      {(["cal", "website"] as const).map((kind) => (
        <ConnectionCard key={kind} kind={kind} connections={connections.filter((c) => c.kind === kind)} />
      ))}
    </div>
  );
}

function ConnectionCard({ kind, connections }: { kind: "cal" | "website"; connections: ConnectionRow[] }) {
  const [created, action, pending] = useActionState<NewConnection>(createConnection.bind(null, kind), null);
  const live = connections.filter((c) => !c.revoked_at);
  const info = KINDS[kind];

  return (
    <section className="card space-y-3 text-sm">
      <h2 className="text-lg font-semibold">{info.title}</h2>
      {live.length === 0 && !created && <p className="text-ink-soft">Not connected.</p>}
      {live.length > 0 && (
        <ul className="divide-y divide-line">
          {live.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                Key ending <span className="font-mono">…{c.key_hint}</span>, made {formatDateTime(c.created_at)}
                <span className="block text-xs text-ink-soft">
                  {c.last_event_at
                    ? `Last event ${formatDateTime(c.last_event_at)}: ${STATUS[c.last_event_status ?? ""] ?? c.last_event_status}`
                    : "Nothing received yet"}
                </span>
              </span>
              <form action={revokeConnection}>
                <input type="hidden" name="connection_id" value={c.id} />
                <button type="submit" className="btn btn-ghost btn-sm">
                  Switch off
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {created && "url" in created ? (
        <NewKey url={created.url} secret={created.key} steps={info.steps} />
      ) : (
        <form action={action}>
          {created && "error" in created && (
            <p className="mb-2 text-danger" role="alert">
              {created.error}
            </p>
          )}
          <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
            {pending ? "Creating…" : live.length ? "Make a new key" : `Connect ${kind === "cal" ? "Cal.com" : "the website"}`}
          </button>
        </form>
      )}
    </section>
  );
}

/** Shown once: the CRM keeps only a fingerprint, so this is the only time the key can be copied. */
function NewKey({ url, secret, steps }: { url: string; secret: string; steps: readonly string[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
  };
  return (
    <div className="space-y-3 rounded-lg bg-paper p-3" role="status">
      <p className="font-medium">Copy these now: the key won&apos;t be shown again.</p>
      {[
        ["Address", url],
        ["Key (secret)", secret],
      ].map(([label, value]) => (
        <div key={label}>
          <p className="field-label">{label}</p>
          <div className="flex gap-2">
            <input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(label, value)}>
              {copied === label ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ))}
      <ol className="list-decimal space-y-1 pl-5">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
