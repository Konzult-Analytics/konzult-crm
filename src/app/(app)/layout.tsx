import Link from "next/link";
import Nav from "@/components/Nav";
import SignOutButton from "@/components/SignOutButton";
import { requireMfaSession } from "@/lib/auth/guard";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireMfaSession();

  return (
    <>
      <header className="-mx-4 border-b border-line bg-panel">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3">
          <Link href="/" className="whitespace-nowrap text-lg font-semibold">
            Konzult <span className="text-accent">CRM</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/log" className="btn btn-accent btn-sm">
              Log a touch
            </Link>
            <SignOutButton className="btn-sm" />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4">
          <Nav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl py-6">{children}</main>
    </>
  );
}
