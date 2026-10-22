import { requireMfaSession } from "@/lib/auth/guard";

type Membership = { role: string; workspaces: { name: string } | null };

// Phase 0 home: proves the whole chain (login, two-factor, database access
// through row-level security). Phase 1 replaces it with the Today screen.
export default async function HomePage() {
  const { supabase, user } = await requireMfaSession();

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces(name)")
    .eq("user_id", user.id);
  if (error) console.error("workspace read failed", error);
  const membership = ((data ?? []) as unknown as Membership[])[0];

  const checks = [
    { label: "Logged in", ok: true, detail: user.email ?? "" },
    { label: "Two-factor passed", ok: true, detail: "This session used your authenticator code" },
    {
      label: "Database access",
      ok: Boolean(membership?.workspaces),
      detail: membership?.workspaces
        ? `${membership.workspaces.name} workspace, ${membership.role}`
        : error
          ? "Couldn't read your workspace"
          : "No workspace linked to this account",
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Set-up check</h1>
      <ul className="card divide-y divide-line p-0">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-3 px-5 py-4">
            <span
              aria-hidden
              className={`mt-0.5 font-bold ${c.ok ? "text-good" : "text-danger"}`}
            >
              {c.ok ? "✓" : "✕"}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{c.label}</p>
              <p className="break-words text-sm text-ink-soft">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
