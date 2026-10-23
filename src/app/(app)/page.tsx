import Link from "next/link";
import TaskItem from "@/components/TaskItem";
import { requireMfaSession } from "@/lib/auth/guard";
import { oneToOneTarget, oneToOnesThisWeek } from "@/lib/crm/bni";
import { addDays, daysAgo, formatDate, formatDateTime, saDate } from "@/lib/crm/dates";
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
import { addLead, discardLead } from "./inbound/actions";
import { closeNeverResponded } from "./pipeline/actions";

const AWAITING_SHOWN = 8;

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
  const [target, oneToOnes, { data: meetings }, { data: enquiries }] = await Promise.all([
    oneToOneTarget(supabase),
    oneToOnesThisWeek(supabase, today),
    supabase
      .from("bookings")
      .select("id, title, starts_at, person_id, people(first_name, last_name)")
      .eq("status", "booked")
      .gte("starts_at", `${today}T00:00:00+02:00`)
      .lt("starts_at", `${addDays(today, 8)}T00:00:00+02:00`)
      .order("starts_at"),
    supabase
      .from("inbound_leads")
      .select("id, name, email, phone, business, message, marketing_consent, received_at")
      .eq("status", "new")
      .order("received_at"),
  ]);

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

      {(meetings ?? []).length > 0 && (
        <Section title="Meetings booked (next 7 days)" count={(meetings ?? []).length}>
          <ul className="card divide-y divide-line p-0">
            {(meetings ?? []).map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  {m.person_id ? (
                    <Link href={`/people/${m.person_id}`} className="font-medium hover:underline">
                      {m.people ? personName(m.people) : "Someone"}
                    </Link>
                  ) : (
                    <span className="font-medium">Someone</span>
                  )}
                  <span className="text-ink-soft"> · {m.title}</span>
                </span>
                <span className={saDate(new Date(m.starts_at)) === today ? "font-medium text-accent" : "text-ink-soft"}>
                  {saDate(new Date(m.starts_at)) === today ? "Today, " : ""}
                  {formatDateTime(m.starts_at)}
                </span>
              </li>
            ))}
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
