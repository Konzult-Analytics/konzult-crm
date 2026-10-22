import Link from "next/link";
import TaskItem from "@/components/TaskItem";
import { requireMfaSession } from "@/lib/auth/guard";
import { addDays, daysAgo, formatDate, saDate } from "@/lib/crm/dates";
import { personName } from "@/lib/crm/people";
import { stageLabel } from "@/lib/crm/stages";
import {
  COLD_AFTER_DAYS,
  UPCOMING_TASK_DAYS,
  birthdaysSoon,
  isAwaitingFirstContact,
  isDueForRevisit,
  isGoingCold,
  splitTasks,
} from "@/lib/crm/today";

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

export default async function TodayPage() {
  const { supabase } = await requireMfaSession();
  const today = saDate();

  const [{ data: tasks }, { data: journeys }, { data: people }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, due_on, people(id, first_name, last_name)")
      .eq("status", "open")
      .lte("due_on", addDays(today, UPCOMING_TASK_DAYS))
      .order("due_on"),
    supabase
      .from("journey_overview")
      .select(
        "id, person_id, organisation_id, display_name, track, stage, status, last_touch_at, stage_changed_at, opened_at, parked_until, exit_reason"
      )
      .in("status", ["open", "parked"]),
    supabase.from("people").select("id, first_name, last_name, birthday").not("birthday", "is", null),
  ]);

  const taskRows = (tasks ?? []).map((t) => ({
    ...t,
    person: t.people ? { id: t.people.id, name: personName(t.people) } : null,
  }));
  const { due, upcoming } = splitTasks(taskRows, today);
  const all = journeys ?? [];
  const cold = all
    .filter((j) => isGoingCold(j, today))
    .sort((a, b) => (a.last_touch_at ?? a.stage_changed_at ?? "").localeCompare(b.last_touch_at ?? b.stage_changed_at ?? ""));
  const awaiting = all
    .filter(isAwaitingFirstContact)
    .sort((a, b) => (a.opened_at ?? "").localeCompare(b.opened_at ?? ""));
  const revisit = all.filter((j) => isDueForRevisit(j, today));
  const birthdays = birthdaysSoon(people ?? [], today);

  const nothing =
    due.length + upcoming.length + cold.length + awaiting.length + revisit.length + birthdays.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-ink-soft">
          {new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "long", day: "numeric", month: "long" }).format(new Date())}
          {" · "}
          {due.length} due · {cold.length} going cold
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

      {due.length > 0 && (
        <Section title="Due and overdue" count={due.length}>
          <ul className="card divide-y divide-line p-0">
            {due.map((t) => (
              <TaskItem key={t.id} task={t} today={today} />
            ))}
          </ul>
        </Section>
      )}

      {cold.length > 0 && (
        <Section title={`Going cold (no touch in ${COLD_AFTER_DAYS}+ days)`} count={cold.length}>
          <ul className="card divide-y divide-line p-0">
            {cold.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Link href={journeyHref(j)} className="min-w-0 flex-1 font-medium hover:underline">
                  {j.display_name}
                </Link>
                <span className="text-sm text-ink-soft">
                  {stageLabel(j.track ?? "", j.stage ?? "")} · touched {daysAgo(j.last_touch_at ?? j.stage_changed_at, today)}
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
                <Link href={journeyHref(j)} className="min-w-0 flex-1 font-medium hover:underline">
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
                <Link href={journeyHref(j)} className="min-w-0 flex-1 font-medium hover:underline">
                  {j.display_name}
                </Link>
                <span className="text-sm text-ink-soft">added {daysAgo(j.opened_at, today)}</span>
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
                <Link href={`/people/${p.id}`} className="min-w-0 flex-1 font-medium hover:underline">
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
