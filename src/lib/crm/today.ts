import { daysBetween, daysUntilBirthday, saDate } from "./dates";
import { isInProgress } from "./stages";

export const COLD_AFTER_DAYS = 14;
export const DORMANT_AFTER_DAYS = 90;
export const UNANSWERED_TRIES = 3;
export const BIRTHDAY_WINDOW_DAYS = 7;
export const UPCOMING_TASK_DAYS = 7;

type JourneyRow = {
  status: string | null;
  track: string | null;
  stage: string | null;
  last_touch_at: string | null;
  stage_changed_at: string | null;
  opened_at: string | null;
  parked_until: string | null;
};

/** Contact has started but nothing has happened for COLD_AFTER_DAYS days. */
export function isGoingCold(j: JourneyRow, today: string): boolean {
  if (j.status !== "open" || !j.track || !j.stage || !isInProgress(j.track, j.stage)) return false;
  const last = j.last_touch_at ?? j.stage_changed_at;
  if (!last) return false;
  return daysBetween(saDate(new Date(last)), today) >= COLD_AFTER_DAYS;
}

/** An active referral partner nobody has been in touch with for DORMANT_AFTER_DAYS. */
export function isDormantPartner(j: JourneyRow, today: string): boolean {
  if (j.status !== "open" || j.track !== "partner" || j.stage !== "active") return false;
  const last = j.last_touch_at ?? j.stage_changed_at;
  return !!last && daysBetween(saDate(new Date(last)), today) >= DORMANT_AFTER_DAYS;
}

type Touch = { direction: string | null; outcome: string | null; occurred_at: string };

/** Messages sent in a row, most recent first, with nothing back since. */
export function unansweredStreak(touches: Touch[]): number {
  const latestFirst = [...touches].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  let streak = 0;
  for (const t of latestFirst) {
    if (t.direction !== "out" || (t.outcome && t.outcome !== "no_reply")) break;
    streak++;
  }
  return streak;
}

export function isAwaitingFirstContact(j: JourneyRow): boolean {
  return j.status === "open" && j.stage === "prospect";
}

export function isDueForRevisit(j: JourneyRow, today: string): boolean {
  return j.status === "parked" && !!j.parked_until && j.parked_until <= today;
}

export function birthdaysSoon<T extends { birthday: string | null }>(
  people: T[],
  today: string
): (T & { inDays: number })[] {
  return people
    .filter((p): p is T & { birthday: string } => !!p.birthday)
    .map((p) => ({ ...p, inDays: daysUntilBirthday(p.birthday, today) }))
    .filter((p) => p.inDays <= BIRTHDAY_WINDOW_DAYS)
    .sort((a, b) => a.inDays - b.inDays);
}

export function splitTasks<T extends { due_on: string }>(tasks: T[], today: string) {
  return {
    due: tasks.filter((t) => t.due_on <= today),
    upcoming: tasks.filter((t) => t.due_on > today && daysBetween(today, t.due_on) <= UPCOMING_TASK_DAYS),
  };
}
