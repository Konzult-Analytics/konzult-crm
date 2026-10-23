import { NextResponse } from "next/server";
import { requireMfaSession } from "@/lib/auth/guard";
import { bookingUrl } from "@/lib/crm/booking-links";
import { bookingSettings } from "@/lib/crm/booking-settings";
import { qrSvg } from "@/lib/crm/qr";

/** The QR code for one event type as an SVG file, sharp at any print size. */
export async function GET(request: Request) {
  const { supabase } = await requireMfaSession();
  const { page, types } = await bookingSettings(supabase);
  const type = new URL(request.url).searchParams.get("type");
  const chosen = types.find((t) => t.slug === type);
  if (!page || !chosen) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(qrSvg(bookingUrl(page, chosen.slug, { source: "qr" })), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="konzult-${chosen.slug}-qr.svg"`,
      "Cache-Control": "private, no-store",
    },
  });
}
