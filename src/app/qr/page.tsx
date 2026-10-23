import type { Metadata } from "next";
import Link from "next/link";
import QrCode from "@/components/QrCode";
import { requireMfaSession } from "@/lib/auth/guard";
import { bookingUrl } from "@/lib/crm/booking-links";
import { bookingSettings } from "@/lib/crm/booking-settings";

export const metadata: Metadata = { title: "Booking QR · Konzult CRM" };

/** Full screen, to hold up for someone to scan. Behind login like every other page. */
export default async function QrPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const { supabase } = await requireMfaSession();
  const { page, types } = await bookingSettings(supabase);
  const chosen = types.find((t) => t.slug === type) ?? types[0];

  if (!page || !chosen) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6 text-sm">
        <p>Add your Cal.com booking page and event types first.</p>
        <Link href="/campaigns?tab=booking" className="link">
          Set up booking links
        </Link>
      </main>
    );
  }

  const url = bookingUrl(page, chosen.slug, { source: "qr" });
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-white p-6 text-center text-black">
      <div>
        <p className="text-sm text-neutral-600">Scan to book with Zander Kotze, Konzult</p>
        <p className="text-2xl font-semibold">{chosen.label}</p>
      </div>
      <QrCode text={url} label={`QR code for booking a ${chosen.label}`} className="w-full max-w-[min(80vw,60vh)]" />
      <p className="max-w-md break-all text-xs text-neutral-600">{bookingUrl(page, chosen.slug)}</p>
      {types.length > 1 && (
        <nav aria-label="Event types" className="flex flex-wrap justify-center gap-2">
          {types.map((t) => (
            <Link
              key={t.slug}
              href={`/qr?type=${t.slug}`}
              aria-current={t.slug === chosen.slug ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                t.slug === chosen.slug ? "border-black bg-black text-white" : "border-neutral-300"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      <Link href="/" className="text-sm underline">
        Done
      </Link>
    </main>
  );
}
