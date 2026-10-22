"use client";

import { useActionState } from "react";
import SignOutButton from "@/components/SignOutButton";
import { verifyCode } from "../actions";

export default function VerifyPage() {
  const [state, formAction, pending] = useActionState(verifyCode, null);

  return (
    <div className="auth-card">
      <h1 className="text-2xl font-semibold">Enter your code</h1>
      <p className="mt-2 text-sm text-ink-soft">Open your authenticator app and enter the 6-digit code for Konzult CRM.</p>
      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label className="field-label" htmlFor="code">
            6-digit code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
          />
        </div>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <button className="btn btn-accent w-full" type="submit" disabled={pending}>
          {pending ? "Checking…" : "Continue"}
        </button>
      </form>
      <SignOutButton className="mt-6 w-full" />
    </div>
  );
}
