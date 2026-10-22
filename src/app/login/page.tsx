"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <div className="auth-card">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
          />
        </div>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <button className="btn btn-accent w-full" type="submit" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
