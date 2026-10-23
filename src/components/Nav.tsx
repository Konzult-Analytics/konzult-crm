"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// `short` and the tighter phone spacing keep all six tabs on a phone screen.
const LINKS: { href: string; label: string; short?: string }[] = [
  { href: "/", label: "Today" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/people", label: "People" },
  { href: "/organisations", label: "Organisations", short: "Orgs" },
  { href: "/insights", label: "Insights" },
  { href: "/library", label: "Library" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="-mb-px flex gap-0.5 overflow-x-auto sm:gap-1">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            aria-label={l.short ? l.label : undefined}
            className={`whitespace-nowrap border-b-2 px-1.5 py-2.5 text-[13px] font-medium sm:px-3 sm:text-sm ${
              active ? "border-accent text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {l.short ? (
              <>
                <span className="sm:hidden">{l.short}</span>
                <span className="hidden sm:inline">{l.label}</span>
              </>
            ) : (
              l.label
            )}
          </Link>
        );
      })}
    </nav>
  );
}
