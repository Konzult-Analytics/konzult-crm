import SignOutButton from "@/components/SignOutButton";
import { requireMfaSession } from "@/lib/auth/guard";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireMfaSession();

  return (
    <>
      <header className="-mx-4 border-b border-line bg-panel">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <span className="whitespace-nowrap text-lg font-semibold">
            Konzult <span className="text-accent">CRM</span>
          </span>
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="hidden truncate text-ink-soft sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl py-6">{children}</main>
    </>
  );
}
