import Link from "next/link";
import AgendaList from "@/components/AgendaList";
import CalendarStatus from "@/components/CalendarStatus";
import { requireMfaSession } from "@/lib/auth/guard";
import { loadAgenda } from "@/lib/calendar/load";
import { bookingSettings } from "@/lib/crm/booking-settings";
import { addDays, daysBetween, formatDay, saDate } from "@/lib/crm/dates";

const DAYS = 14;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from: requested } = await searchParams;
  const { supabase } = await requireMfaSession();
  const today = saDate();
  // Up to a year either side of today.
  const first =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && Math.abs(daysBetween(today, requested)) <= 366 ? requested : today;

  const [agenda, booking] = await Promise.all([loadAgenda(supabase, first, DAYS), bookingSettings(supabase)]);
  const last = addDays(first, DAYS - 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-ink-soft">
            {formatDay(first)} to {formatDay(last)}
          </p>
        </div>
        <nav aria-label="Weeks" className="flex flex-wrap gap-2">
          <Link href={`/calendar?from=${addDays(first, -DAYS)}`} className="btn btn-ghost btn-sm">
            ← Earlier
          </Link>
          {first !== today && (
            <Link href="/calendar" className="btn btn-ghost btn-sm">
              From today
            </Link>
          )}
          <Link href={`/calendar?from=${addDays(first, DAYS)}`} className="btn btn-ghost btn-sm">
            Later →
          </Link>
          {booking.types.length > 0 && (
            <Link href="/qr" className="btn btn-ghost btn-sm">
              Booking QR
            </Link>
          )}
        </nav>
      </div>
      <CalendarStatus state={agenda.state} readAt={agenda.readAt} />
      <AgendaList days={agenda.days} today={today} bookingPage={booking.page} />
    </div>
  );
}
