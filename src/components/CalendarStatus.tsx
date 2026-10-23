import type { CalendarState } from "@/lib/calendar/feed";
import { formatTime } from "@/lib/crm/dates";

const STEPS = [
  "In Google Calendar on a computer, open Settings, then under “Settings for my calendars” pick konzult.info@gmail.com and open “Integrate calendar”.",
  "Copy the “Secret address in iCal format”. Treat it like a password: don't paste it into chat or email.",
  "In Vercel, open konzult-crm → Settings → Environment Variables. Add GOOGLE_CALENDAR_ICS_URL for Production only, mark it Sensitive, paste the address and save.",
  "Redeploy production (Deployments → the latest one → Redeploy). The calendar shows up here within a minute.",
];

/** Where the calendar comes from, and how to connect it when it isn't. */
export default function CalendarStatus({ state, readAt }: { state: CalendarState; readAt: string | null }) {
  if (state === "connected" || state === "sample") {
    return (
      <p className="text-sm text-ink-soft">
        {state === "connected"
          ? `Your Google Calendar, read-only${readAt ? ` · updated ${formatTime(readAt)}` : ""}. Bookings from Cal.com land there too.`
          : "Sample calendar: dev and preview never read your real one."}
      </p>
    );
  }
  return (
    <div className="card space-y-3 text-sm">
      <p className="font-medium">
        {state === "error"
          ? "Couldn't read your Google Calendar just now, so only Cal.com bookings show. Check the address in Vercel if this keeps happening."
          : "Connect your Google Calendar to see every meeting here, not only Cal.com bookings."}
      </p>
      <details open={state === "not_set"}>
        <summary className="cursor-pointer">How to connect it (5 minutes)</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="mt-2 text-ink-soft">
          The CRM can only read the calendar, never change it, and keeps no copy. If the address ever leaks, press Reset
          next to it in Google and put the new one in Vercel.
        </p>
      </details>
    </div>
  );
}
