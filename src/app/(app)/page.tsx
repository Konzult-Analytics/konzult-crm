import Link from "next/link";
import AgendaList from "@/components/AgendaList";
import CalendarStatus from "@/components/CalendarStatus";
import TaskItem from "@/components/TaskItem";
import { requireMfaSession } from "@/lib/auth/guard";
import { loadAgenda } from "@/lib/calendar/load";
import { oneToOneTarget, oneToOnesThisWeek } from "@/lib/crm/bni";
import { BOOKING_SOURCES, bookingChangeUrls } from "@/lib/crm/booking-links";
import { bookingSettings } from "@/lib/crm/booking-settings";
import { addDays, daysAgo, formatDate, formatDateTime, saDate } from "@/lib/crm/dates";
import { labelOf } from "@/lib/crm/labels";
import { personName } from "@/lib/crm/people";
import { stageLabel } from "@/lib/crm/stages";
import { fetchAll } from "@/lib/supabase/fetch-all";
import {
  COLD_AFTER_DAYS,
  DORMANT_AFTER_DAYS,
  UNANSWERED_TRIES,
  UPCOMING_TASK_DAYS,
  birthdaysSoon,
  isAwaitingFirstContact,
  isDormantPartner,
  isDueForRevisit,
  isGoingCold,
  splitTasks,
  unansweredStreak,
} from "@/lib/crm/today";
import { markNoShow } from "./calendar/actions";
import { addLead, discardLead } from "./inbound/actions";
import { closeNeverResponded } from "./pipeline/actions";

const AWAITING_SHOWN = 8;
/** Meetings older than this no longer ask how they went. */
const WRAP_UP_DAYS = 30;

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="section-title flex items-center gap-2">
        {title}
        {count !== undefined && <span className="badge">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function journeyHref(j: { person_id: string | null; organisation_id: string | null }) {
  return j.person_id ? `/people/${j.person_id}` : `/organisations/${j.organisation_id}`;
}

function stageText(j: { track: string | null; stage: string | null }) {
  const stage = stageLabel(j.track ?? "", j.stage ?? "");
  return j.track === "partner" ? `Partner · ${stage}` : stage;
}

export default async function TodayPage() {
  const { supabase } = await requireMfaSession();
  const today = saDate();
  const now = new Date().toISOString();
  const [target, oneToOnes, agenda, booking, { data: meetings }, { data: held }, { data: enquiries }] = await Promise.all([
    oneToOneTarget(supabase),
    oneToOnesThisWeek(supabase, today),
    loadAgenda(supabase, today, 1),
    bookingSettings(supabase),
    supabase
      .from("bookings")
      .select("id, external_uid, title, starts_at, source, person_id, people(first_name, last_name)")
      .eq("status", "booked")
      .gte("starts_at", `${addDays(today, 1)}T00:00:00+02:00`)
      .lt("starts_at", `${addDays(today, 8)}T00:00:00+02:00`)
      .order("starts_at"),
    supabase
      .from("bookings")
      .select("id, title, starts_at, ends_at, person_id, people(first_name, last_name)")
      .eq("status", "booked")
      .is("outcome", null)
      .gte("starts_at", `${addDays(today, -WRAP_UP_DAYS)}T00:00:00+02:00`)
      .lt("starts_at", now)
      .order("starts_at"),
    supabase
      .from("inbound_leads")
      .select("id, name, email, phone, business, message, marketing_consent, received_at")
      .eq("status", "new")
      .order("received_at"),
  ]);
  const yourDay = agenda.days[0]?.items ?? [];
  const wrapUp = (held ?? []).filter((b) => Date.parse(b.ends_at ?? b.starts_at) <= Date.parse(now));

  const [{ data: tasks }, { data: journeys }, { data: people }, { data: touches }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, due_on, people(id, first_name, last_name)")
      .eq("status", "open")
      .lte("due_on", addDays(today, UPCOMING_TASK_DAYS))
      .order("due_on"),
    fetchAll((from, to) =>
      supabase
        .from("journey_overview")
        .select(
          "id, person_id, organisation_id, display_name, track, stage, status, last_touch_at, stage_changed_at, opened_at, parked_until, exit_reason"
        )
        .in("status", ["open", "parked"])
        .order("id")
        .range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from("people")
        .select("id, first_name, last_name, birthday")
        .not("birthday", "is", null)
        .order("id")
        .range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from("interactions")
        .select("journey_id, direction, outcome, occurred_at")
        .not("journey_id", "is", null)
        .order("id")
        .range(from, to)
    ),
  ]);

  const taskRows = (tasks ?? []).map((t) => ({
    ...t,
    person: t.people ? { id: t.people.id, name: personName(t.people) } : null,
  }));
  const { due, upcoming } = splitTasks(taskRows, today);
  const all = journeys ?? [];
  const touchesByJourney = new Map<string, NonNullable<typeof touches>>();
  for (const t of touches ?? []) {
    touchesByJourney.set(t.journey_id!, [...(touchesByJourney.get(t.journey_id!) ?? []), t]);
  }
  const unanswered = all.filter(
    (j) =>
      j.status === "open" &&
      j.stage !== "client" &&
      j.stage !== "active" &&
      unansweredStreak(touchesByJourney.get(j.id!) ?? []) >= UNANSWERED_TRIES
  );
  const unansweredIds = new Set(unanswered.map((j) => j.id));
  const cold = all
    .filter((j) => isGoingCold(j, today) && !unansweredIds.has(j.id))
    .sort((a, b) => (a.last_touch_at ?? a.stage_changed_at ?? "").localeCompare(b.last_touch_at ?? b.stage_changed_at ?? ""));
  const dormant = all.filter((j) => isDormantPartner(j, today));
  const awaiting = all
    .filter(isAwaitingFirstContact)
    .sort((a, b) => (a.opened_at ?? "").localeCompare(b.opened_at ?? ""));
  const revisit = all.filter((j) => isDueForRevisit(j, today));
  const birthdays = birthdaysSoon(people ?? [], today);

  const nothing =
    yourDay.length +
      wrapUp.length +
      (meetings ?? []).length +
      (enquiries ?? []).length +
      due.length +
      upcoming.length +
      unanswered.length +
      cold.length +
      dormant.length +
      awaiting.length +
      revisit.length +
      birthdays.length ===
    0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="text-sm text-ink-soft">
            {new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "long", day: "numeric", month: "long" }).format(new Date())}
            {" · "}
            {due.length} due · {cold.length} going cold
            {target.on && (
              <>
                {" · "}
                <Link href="/campaigns?tab=bni" className={oneToOnes >= target.target ? "text-ink" : undefined}>
                  {oneToOnes} of {target.target} one-to-ones this week
                </Link>
              </>
            )}
          </p>
        </div>
        {booking.types.length > 0 && (
          <Link href="/qr" className="btn btn-ghost btn-sm">
            Booking QR
          </Link>
        )}
      </div>

      {(yourDay.length > 0 || agenda.state === "error") && (
        <Section title="Your day" count={yourDay.length}>
          {agenda.state === "error" && <CalendarStatus state={agenda.state} readAt={agenda.readAt} />}
          {yourDay.length > 0 && <AgendaList days={agenda.days} today={today} bookingPage={booking.page} headings={false} />}
          <p className="text-sm">
            <Link href="/calendar" className="link">
              See the next two weeks
            </Link>
          </p>
        </Section>
      )}

      {nothing && (
        <div className="card space-y-2 text-sm">
          <p className="font-medium">Nothing needs you right now.</p>
          <p className="text-ink-soft">
            <Link href="/people/new" className="link">Add someone</Link> you met, or{" "}
            <Link href="/log" className="link">log a touch</Link>.
          </p>
        </div>
      )}

      {(enquiries ?? []).length > 0 && (
        <Section title="New enquiries from the website" count={(enquiries ?? []).length}>
          <ul className="card divide-y divide-line p-0">
            {(enquiries ?? []).map((e) => (
              <li key={e.id} className="space-y-2 px-4 py-3 text-sm">
                <p>
                  <span className="font-medium">{e.name ?? e.email ?? e.phone}</span>
                  {e.business && <span className="text-ink-soft"> · {e.business}</span>}
                  <span className="block text-xs text-ink-soft">
                    {[e.email, e.phone].filter(Boolean).join(" · ")} · {formatDateTime(e.received_at)}
                    {e.marketing_consent && " · agreed to marketing"}
                  </span>
                </p>
                {e.message && <p className="line-clamp-3 whitespace-pre-line break-words">{e.message}</p>}
                <div className="flex gap-2">
                  <form action={addLead}>
                    <input type="hidden" name="lead_id" value={e.id} />
                    <button type="submit" className="btn btn-accent btn-sm">
                      Add to CRM
                    </button>
                  </form>
                  <form action={discardLead}>
                    <input type="hidden" name="lead_id" value={e.id} />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Not a lead
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {wrapUp.length > 0 && (
        <Section title="How did it go?" count={wrapUp.length}>
          <ul className="card divide-y divide-line p-0">
            {wrapUp.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  {m.person_id ? (
                    <Link href={`/people/${m.person_id}`} className="font-medium hover:underline">
                      {m.people ? personName(m.people) : "Someone"}
                    </Link>
                  ) : (
                    <span className="font-medium">Someone</span>
                  )}
                  <span className="text-ink-soft">
                    {" "}
                    · {m.title} · {formatDateTime(m.starts_at)}
                  </span>
                </span>
                <span className="flex gap-2">
                  {m.person_id && (
                    <Link href={`/log?person=${m.person_id}&booking=${m.id}`} className="btn btn-accent btn-sm">
                      It happened: log it
                    </Link>
                  )}
                  <form action={markNoShow}>
                    <input type="hidden" name="booking_id" value={m.id} />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Didn&apos;t show
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(meetings ?? []).length > 0 && (
        <Section title="Booked meetings, next 7 days" count={(meetings ?? []).length}>
          <ul className="card divide-y divide-line p-0">
            {(meetings ?? []).map((m) => {
              const change = bookingChangeUrls(booking.page, m.external_uid);
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                  <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                    {m.person_id ? (
                      <Link href={`/people/${m.person_id}`} className="font-medium hover:underline">
                        {m.people ? personName(m.people) : "Someone"}
                      </Link>
                    ) : (
                      <span className="font-medium">Someone</span>
                    )}
                    <span className="text-ink-soft"> · {m.title}</span>
                    {m.source !== "link" && <span className="badge ml-2">{labelOf(BOOKING_SOURCES, m.source)}</span>}
                  </span>
                  <span className="text-ink-soft">{formatDateTime(m.starts_at)}</span>
                  {change && (
                    <span className="flex gap-2">
                      <a href={change.reschedule} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        Reschedule
                      </a>
                      <a href={change.cancel} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        Cancel
                      </a>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {due.length > 0 && (
        <Section title="Due and overdue" count={due.length}>
          <ul className="card divide-y divide-line p-0">
            {due.map((t) => (
              <TaskItem key={t.id} task={t} today={today} />
            ))}
          </ul>
        </Section>
      )}

      {unanswered.length > 0 && (
        <Section title={`No reply after ${UNANSWERED_TRIES} tries`} count={unanswered.length}>
          <ul className="card divide-y divide-line p-0">
            {unanswered.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <Link href={journeyHref(j)} className="min-w-0 basis-full font-medium hover:underline sm:basis-0 sm:flex-1">
                  {j.display_name}
                </Link>
                <span className="text-sm text-ink-soft">
                  {stageText(j)} · last message {daysAgo(j.last_touch_at, today)}
                </span>
                <span className="flex gap-2">
                  {j.person_id && (
                    <Link href={`/log?person=${j.person_id}`} className="btn btn-ghost btn-sm">
                      Try another way
                    </Link>
                  )}
                  <form action={closeNeverResponded}>
                    <input type="hidden" name="journey_id" value={j.id!} />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Close: never responded
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cold.length > 0 && (
        <Section title={`Going cold (no touch in ${COLD_AFTER_DAYS}+ days)`} count={cold.length}>
          <ul className="card divide-y divide-line p-0">
            {cold.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Link href={journeyHref(j)} className="min-w-0 basis-full font-medium hover:underline sm:basis-0 sm:flex-1">
                  {j.display_name}
                </Link>
                <span className="text-sm text-ink-soft">
                  {stageText(j)} · touched {daysAgo(j.last_touch_at ?? j.stage_changed_at, today)}
                </span>
                {j.person_id && (
                  <Link href={`/log?person=${j.person_id}`} className="btn btn-ghost btn-sm">
                    Log a touch
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {dormant.length > 0 && (
        <Section title={`Partners to reconnect with (${DORMANT_AFTER_DAYS}+ days)`} count={dormant.length}>
          <ul className="card divide-y divide-line p-0">
            {dormant.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Link href={journeyHref(j)} className="min-w-0 basis-full font-medium hover:underline sm:basis-0 sm:flex-1">
                  {j.display_name}
                </Link>
                <span className="text-sm text-ink-soft">
                  {stageText(j)} · touched {daysAgo(j.last_touch_at ?? j.stage_changed_at, today)}
                </span>
                {j.person_id && (
                  <Link href={`/log?person=${j.person_id}`} className="btn btn-ghost btn-sm">
                    Log a touch
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {revisit.length > 0 && (
        <Section title="Parked: time to revisit" count={revisit.length}>
          <ul className="card divide-y divide-line p-0">
            {revisit.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 px-4 py-3">
                <Link href={journeyHref(j)} className="min-w-0 basis-full font-medium hover:underline sm:basis-0 sm:flex-1">
                  {j.display_name}
                </Link>
                <span className="text-sm text-ink-soft">
                  parked until {formatDate(j.parked_until)} · {j.exit_reason}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {awaiting.length > 0 && (
        <Section title="Not contacted yet" count={awaiting.length}>
          <ul className="card divide-y divide-line p-0">
            {awaiting.slice(0, AWAITING_SHOWN).map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Link href={journeyHref(j)} className="min-w-0 basis-full font-medium hover:underline sm:basis-0 sm:flex-1">
                  {j.display_name}
                </Link>
                <span className="text-sm text-ink-soft">
                  {j.track === "partner" ? "Partner · " : ""}added {daysAgo(j.opened_at, today)}
                </span>
                {j.person_id && (
                  <Link href={`/log?person=${j.person_id}`} className="btn btn-ghost btn-sm">
                    Log first contact
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {awaiting.length > AWAITING_SHOWN && (
            <p className="text-sm text-ink-soft">
              And {awaiting.length - AWAITING_SHOWN} more in the{" "}
              <Link href="/pipeline" className="link">Prospect column</Link>.
            </p>
          )}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Coming up this week" count={upcoming.length}>
          <ul className="card divide-y divide-line p-0">
            {upcoming.map((t) => (
              <TaskItem key={t.id} task={t} today={today} />
            ))}
          </ul>
        </Section>
      )}

      {birthdays.length > 0 && (
        <Section title="Birthdays this week">
          <ul className="card divide-y divide-line p-0">
            {birthdays.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/people/${p.id}`} className="min-w-0 basis-full font-medium hover:underline sm:basis-0 sm:flex-1">
                  {personName(p)}
                </Link>
                <span className="text-sm text-ink-soft">
                  {p.inDays === 0 ? "today" : p.inDays === 1 ? "tomorrow" : `in ${p.inDays} days`}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
