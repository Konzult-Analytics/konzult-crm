import Link from "next/link";
import type { AgendaDay, AgendaItem } from "@/lib/calendar/agenda";
import { BOOKING_SOURCES, bookingChangeUrls } from "@/lib/crm/booking-links";
import { addDays, formatDay, formatTime } from "@/lib/crm/dates";
import { labelOf } from "@/lib/crm/labels";

function dayHeading(date: string, today: string): string {
  if (date === today) return `Today · ${formatDay(date)}`;
  if (date === addDays(today, 1)) return `Tomorrow · ${formatDay(date)}`;
  return formatDay(date);
}

function Item({ item, bookingPage, now }: { item: AgendaItem; bookingPage: string | null; now: Date }) {
  const upcoming = Date.parse(item.end) > now.getTime();
  const change = item.booking && upcoming && !item.allDay ? bookingChangeUrls(bookingPage, item.booking.uid) : null;
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
      <span className="w-24 shrink-0 tabular-nums text-ink-soft">
        {item.allDay ? "All day" : `${formatTime(item.start)}–${formatTime(item.end)}`}
      </span>
      <span className="min-w-[10rem] flex-1 space-y-1">
        <span className={`block break-words font-medium ${upcoming ? "" : "text-ink-soft"}`}>
          {item.title}
          {item.people.map((p, i) => (
            <span key={p.id} className="font-normal">
              {i === 0 ? " · with " : ", "}
              <Link href={`/people/${p.id}`} className="link">
                {p.name}
              </Link>
            </span>
          ))}
        </span>
        {(item.location && !item.joinUrl) || item.booking || item.overlaps || !item.busy ? (
          <span className="flex flex-wrap gap-1.5 text-xs text-ink-soft">
            {item.location && !item.joinUrl && <span className="break-words">{item.location}</span>}
            {item.booking && <span className="badge">Cal.com · {labelOf(BOOKING_SOURCES, item.booking.source)}</span>}
            {item.overlaps && <span className="badge badge-danger">Overlaps</span>}
            {!item.busy && <span className="badge">Free</span>}
          </span>
        ) : null}
      </span>
      {(item.joinUrl && upcoming) || change ? (
        <span className="flex flex-wrap gap-2">
          {item.joinUrl && upcoming && (
            <a href={item.joinUrl} target="_blank" rel="noreferrer" className="btn btn-accent btn-sm">
              Join
            </a>
          )}
          {change && (
            <>
              <a href={change.reschedule} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                Reschedule
              </a>
              <a href={change.cancel} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                Cancel
              </a>
            </>
          )}
        </span>
      ) : null}
    </li>
  );
}

/** Days of calendar items. With one day and no heading, it's a plain list (Today's "Your day"). */
export default function AgendaList({
  days,
  today,
  bookingPage,
  headings = true,
}: {
  days: AgendaDay[];
  today: string;
  bookingPage: string | null;
  headings?: boolean;
}) {
  const now = new Date();
  return (
    <div className="space-y-4">
      {days.map((d) => (
        <section key={d.date} className="space-y-2" aria-label={formatDay(d.date)}>
          {headings && (
            <h2 className={`section-title ${d.date === today ? "text-accent" : ""}`}>{dayHeading(d.date, today)}</h2>
          )}
          {d.items.length === 0 ? (
            <p className="px-1 text-sm text-ink-soft">Nothing in the calendar.</p>
          ) : (
            <ul className="card divide-y divide-line p-0">
              {d.items.map((i) => (
                <Item key={i.key} item={i} bookingPage={bookingPage} now={now} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
