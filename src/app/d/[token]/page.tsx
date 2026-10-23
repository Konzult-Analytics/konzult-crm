import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import OpenButton from "./OpenButton";

// The page a contact lands on from a tracked link. Opening only counts when
// they press Open, so link previews in WhatsApp and email scanners don't.
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

async function info(token: string) {
  if (!TOKEN.test(token)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("share_info", { p_token: token });
  if (error) console.error("share info failed", error);
  return data?.[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const doc = await info((await params).token);
  return {
    title: doc?.state === "ok" ? `${doc.title} · Konzult` : "Konzult",
    robots: { index: false, follow: false },
  };
}

const UNAVAILABLE: Record<string, string> = {
  revoked: "This document is no longer available.",
  expired: "This link has expired.",
};

export default async function SharedDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await info(token);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center py-12">
      <div className="card space-y-4">
        <p className="text-lg font-semibold">
          Konzult<span className="text-accent">.</span>
        </p>
        {doc?.state === "ok" ? (
          <>
            <div className="space-y-1">
              <h1 className="break-words text-2xl font-semibold">{doc.title}</h1>
              <p className="text-sm text-ink-soft">Shared with you by Zander Kotze, Konzult.</p>
            </div>
            <OpenButton token={token} />
            <p className="text-xs text-ink-soft">
              Konzult records when this link is opened, so Zander knows when to follow up. If you&apos;d rather he
              didn&apos;t, reply to his message and he&apos;ll stop.
            </p>
          </>
        ) : (
          <p>
            {(doc && UNAVAILABLE[doc.state]) ?? "This link isn't valid."} Reply to Zander&apos;s message and he&apos;ll
            send you a fresh one.
          </p>
        )}
      </div>
    </main>
  );
}
