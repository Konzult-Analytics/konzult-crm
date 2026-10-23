"use client";

import { useState } from "react";

const PROBLEM: Record<string, string> = {
  revoked: "This document is no longer available.",
  expired: "This link has expired.",
  busy: "This link has been opened many times in the last hour. Try again a little later.",
};

export default function OpenButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "opening" | string>("idle");

  const open = async () => {
    setState("opening");
    try {
      const res = await fetch(`/d/${token}/open`, { method: "POST" });
      const body = (await res.json()) as { url?: string; state?: string };
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      setState(body.state ?? "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-accent w-full" disabled={state === "opening"} onClick={open}>
        {state === "opening" ? "Opening…" : "Open"}
      </button>
      {state !== "idle" && state !== "opening" && (
        <p className="text-sm text-danger" role="alert">
          {PROBLEM[state] ?? "That didn't work. Try again."}
        </p>
      )}
    </div>
  );
}
