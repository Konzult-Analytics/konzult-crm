"use client";

import { useState } from "react";
import { revokeSend } from "@/app/(app)/people/send-actions";
import { formatDate, formatDateTime } from "@/lib/crm/dates";

export type SentLink = {
  id: string;
  title: string;
  channel: string;
  sent_at: string;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  share_token: string;
};

function status(s: SentLink): { text: string; tone: string } {
  if (s.revoked_at) return { text: "Switched off", tone: "badge" };
  if (s.expires_at <= new Date().toISOString()) return { text: "Expired", tone: "badge" };
  if (s.open_count === 0) return { text: "Not opened yet", tone: "badge" };
  return { text: `Opened ${s.open_count}×`, tone: "badge badge-accent" };
}

export default function SentLinks({ sends }: { sends: SentLink[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (sends.length === 0) return null;

  const copy = async (s: SentLink) => {
    await navigator.clipboard.writeText(`${window.location.origin}/d/${s.share_token}`);
    setCopied(s.id);
  };

  return (
    <ul className="card divide-y divide-line p-0 text-sm">
      {sends.map((s) => {
        const st = status(s);
        const live = !s.revoked_at && s.expires_at > new Date().toISOString();
        return (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="min-w-0">
              <span className="font-medium">{s.title}</span> <span className={st.tone}>{st.text}</span>
              <span className="block text-xs text-ink-soft">
                Sent {formatDate(s.sent_at)} by {s.channel === "whatsapp" ? "WhatsApp" : "email"}
                {s.first_opened_at && ` · first opened ${formatDateTime(s.first_opened_at)}`}
                {s.last_opened_at && s.open_count > 1 && ` · last ${formatDateTime(s.last_opened_at)}`}
              </span>
            </span>
            {live && (
              <span className="flex gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(s)}>
                  {copied === s.id ? "Copied" : "Copy link"}
                </button>
                <form action={revokeSend}>
                  <input type="hidden" name="send_id" value={s.id} />
                  <button type="submit" className="btn btn-ghost btn-sm">
                    Switch off
                  </button>
                </form>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
