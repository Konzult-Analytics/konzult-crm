import { addDays, daysBetween, saDate } from "./dates";
import { STAGES, isTrack, type Track } from "./stages";

export type InsightJourney = {
  id: string;
  track: string | null;
  stage: string | null;
  status: string | null;
  exit_stage: string | null;
  exit_reason: string | null;
  exit_side: string | null;
  source: string | null;
  referred_by: string | null;
  opened_at: string | null;
  value_estimate: number | null;
  fit_score: number | null;
};

export type InsightHistory = { journey_id: string; to_stage: string; changed_at: string };

export type InsightTouch = {
  type: string;
  direction: string | null;
  outcome: string | null;
  occurred_at: string;
  journey_id: string | null;
  meeting_setting: string | null;
  campaign: string | null;
};

/** A fit score at or above this counts as a strong fit. */
export const STRONG_FIT = 60;
const REPLIED = new Set(["replied", "interested", "meeting_booked"]);

function stageIndex(track: Track, stage: string | null): number {
  return stage ? STAGES[track].findIndex((s) => s.key === stage) : -1;
}

/** The furthest stage a journey ever reached (stages only move forward in practice, but history is the record). */
export function furthest(j: InsightJourney, history: Map<string, InsightHistory[]>): number {
  if (!isTrack(j.track)) return -1;
  const track = j.track;
  const seen = [j.stage, j.exit_stage, ...(history.get(j.id) ?? []).map((h) => h.to_stage)];
  return Math.max(...seen.map((s) => stageIndex(track, s)));
}

export function historyByJourney(history: InsightHistory[]): Map<string, InsightHistory[]> {
  const map = new Map<string, InsightHistory[]>();
  for (const h of history) {
    const list = map.get(h.journey_id) ?? [];
    list.push(h);
    map.set(h.journey_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.changed_at.localeCompare(b.changed_at));
  return map;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const rate = (part: number, whole: number) => (whole ? part / whole : null);

/** A share as a whole percentage, or a dash when there's nothing to divide. */
export function pct(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}

export type FunnelStep = {
  key: string;
  label: string;
  reached: number;
  /** Share of the previous step that got here. */
  fromPrevious: number | null;
  open: number;
  lost: number;
  parked: number;
};

export function funnel(journeys: InsightJourney[], history: Map<string, InsightHistory[]>, track: Track): FunnelStep[] {
  const own = journeys.filter((j) => j.track === track);
  const far = own.map((j) => furthest(j, history));
  return STAGES[track].map((s, i) => {
    const reached = far.filter((f) => f >= i).length;
    const previous = i === 0 ? null : far.filter((f) => f >= i - 1).length;
    return {
      key: s.key,
      label: s.label,
      reached,
      fromPrevious: previous === null ? null : rate(reached, previous),
      open: own.filter((j) => j.status === "open" && j.stage === s.key).length,
      lost: own.filter((j) => j.status === "lost" && j.exit_stage === s.key).length,
      parked: own.filter((j) => j.status === "parked" && j.exit_stage === s.key).length,
    };
  });
}

export type SourceRow = {
  name: string;
  journeys: number;
  meetings: number;
  won: number;
  winRate: number | null;
  wonValue: number;
};

function bySomething(
  journeys: InsightJourney[],
  history: Map<string, InsightHistory[]>,
  track: Track,
  keyOf: (j: InsightJourney) => string | null
): SourceRow[] {
  const meetingAt = 2;
  const wonAt = STAGES[track].length - 1;
  const groups = new Map<string, InsightJourney[]>();
  for (const j of journeys.filter((j) => j.track === track)) {
    const key = keyOf(j);
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), j]);
  }
  return [...groups.entries()]
    .map(([name, list]) => {
      const far = list.map((j) => furthest(j, history));
      const won = list.filter((_, i) => far[i] >= wonAt);
      return {
        name,
        journeys: list.length,
        meetings: far.filter((f) => f >= meetingAt).length,
        won: won.length,
        winRate: rate(won.length, list.length),
        wonValue: won.reduce((sum, j) => sum + (j.value_estimate ?? 0), 0),
      };
    })
    .sort((a, b) => b.won - a.won || b.journeys - a.journeys || a.name.localeCompare(b.name));
}

export function bySource(journeys: InsightJourney[], history: Map<string, InsightHistory[]>, track: Track): SourceRow[] {
  return bySomething(journeys, history, track, (j) => j.source ?? "Not recorded");
}

/** Who introduced the journeys, and what those introductions became. */
export function byReferrer(journeys: InsightJourney[], history: Map<string, InsightHistory[]>, track: Track): SourceRow[] {
  return bySomething(journeys, history, track, (j) => j.referred_by);
}

export type OutreachRow = {
  name: string;
  sent: number;
  replies: number;
  meetings: number;
  replyRate: number | null;
  meetingRate: number | null;
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  call: "Call",
  bni_message: "BNI Connect",
};

/** Outbound messages and how they were answered, by channel or by campaign. */
export function outreach(touches: InsightTouch[], by: "channel" | "campaign"): OutreachRow[] {
  const groups = new Map<string, InsightTouch[]>();
  for (const t of touches) {
    if (t.direction !== "out") continue;
    const key = by === "channel" ? (CHANNEL_LABEL[t.type] ?? t.type) : t.campaign;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()]
    .map(([name, list]) => {
      const replies = list.filter((t) => t.outcome && REPLIED.has(t.outcome)).length;
      const meetings = list.filter((t) => t.outcome === "meeting_booked").length;
      return {
        name,
        sent: list.length,
        replies,
        meetings,
        replyRate: rate(replies, list.length),
        meetingRate: rate(meetings, list.length),
      };
    })
    .sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name));
}

export type FallOut = {
  byStage: { key: string; label: string; ours: number; theirs: number }[];
  reasons: { reason: string; side: string | null; count: number }[];
  fit: { bucket: "strong" | "weak" | "unchecked"; won: number; lost: number }[];
};

/** Where and why journeys ended, and whether the fit check predicted it. */
export function fallOut(journeys: InsightJourney[], history: Map<string, InsightHistory[]>, track: Track): FallOut {
  const own = journeys.filter((j) => j.track === track);
  const lost = own.filter((j) => j.status === "lost");
  const reasons = new Map<string, { reason: string; side: string | null; count: number }>();
  for (const j of lost) {
    const reason = j.exit_reason ?? "No reason";
    const row = reasons.get(reason) ?? { reason, side: j.exit_side, count: 0 };
    row.count++;
    reasons.set(reason, row);
  }
  const wonAt = STAGES[track].length - 1;
  const bucket = (j: InsightJourney) =>
    j.fit_score === null ? "unchecked" : j.fit_score >= STRONG_FIT ? "strong" : "weak";
  return {
    byStage: STAGES[track].map((s) => ({
      key: s.key,
      label: s.label,
      ours: lost.filter((j) => j.exit_stage === s.key && j.exit_side === "ours").length,
      theirs: lost.filter((j) => j.exit_stage === s.key && j.exit_side !== "ours").length,
    })),
    reasons: [...reasons.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    fit: (["strong", "weak", "unchecked"] as const).map((b) => ({
      bucket: b,
      won: own.filter((j) => bucket(j) === b && furthest(j, history) >= wonAt).length,
      lost: lost.filter((j) => bucket(j) === b).length,
    })),
  };
}

export type Speed = {
  /** Median days from adding someone to the first message sent to them. */
  firstContactDays: number | null;
  /** Median days spent in each stage before moving on. */
  stageDays: { key: string; label: string; days: number | null; journeys: number }[];
};

export function speed(
  journeys: InsightJourney[],
  history: Map<string, InsightHistory[]>,
  touches: InsightTouch[],
  track: Track
): Speed {
  const own = journeys.filter((j) => j.track === track);
  const firstOut = new Map<string, string>();
  for (const t of touches) {
    if (t.direction !== "out" || !t.journey_id) continue;
    const prev = firstOut.get(t.journey_id);
    if (!prev || t.occurred_at < prev) firstOut.set(t.journey_id, t.occurred_at);
  }
  const firstContact = own
    .filter((j) => j.opened_at && firstOut.has(j.id))
    .map((j) => Math.max(0, daysBetween(saDate(new Date(j.opened_at!)), saDate(new Date(firstOut.get(j.id)!)))));

  const spent = new Map<string, number[]>();
  for (const j of own) {
    const steps = history.get(j.id) ?? [];
    for (let i = 0; i < steps.length - 1; i++) {
      const days = daysBetween(saDate(new Date(steps[i].changed_at)), saDate(new Date(steps[i + 1].changed_at)));
      if (steps[i + 1].to_stage === steps[i].to_stage) continue;
      spent.set(steps[i].to_stage, [...(spent.get(steps[i].to_stage) ?? []), Math.max(0, days)]);
    }
  }
  return {
    firstContactDays: median(firstContact),
    stageDays: STAGES[track].slice(0, -1).map((s) => ({
      key: s.key,
      label: s.label,
      days: median(spent.get(s.key) ?? []),
      journeys: spent.get(s.key)?.length ?? 0,
    })),
  };
}

/** Monday of the week (YYYY-MM-DD) a South African date falls in. */
function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** BNI one-to-ones held per week, oldest first, ending with this week. */
export function oneToOnesPerWeek(touches: InsightTouch[], today: string, weeks = 8): { week: string; count: number }[] {
  const current = weekStart(today);
  const starts = Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)));
  const counts = new Map(starts.map((w) => [w, 0]));
  for (const t of touches) {
    if (t.type !== "meeting" || t.meeting_setting !== "bni_one_to_one") continue;
    const w = weekStart(saDate(new Date(t.occurred_at)));
    if (counts.has(w)) counts.set(w, counts.get(w)! + 1);
  }
  return starts.map((week) => ({ week, count: counts.get(week)! }));
}

export type InsightProposal = { status: string; value: number; sent_on: string; decided_on: string | null };

export type ProposalStats = {
  sent: number;
  sentValue: number;
  accepted: number;
  acceptedValue: number;
  declined: number;
  waiting: number;
  waitingValue: number;
  /** Accepted out of those decided either way. */
  acceptRate: number | null;
  /** Median days from sending to a decision. */
  daysToDecision: number | null;
};

export function proposalStats(proposals: InsightProposal[]): ProposalStats {
  const sum = (list: InsightProposal[]) => list.reduce((n, p) => n + p.value, 0);
  const accepted = proposals.filter((p) => p.status === "accepted");
  const declined = proposals.filter((p) => p.status === "declined");
  const waiting = proposals.filter((p) => p.status === "sent");
  return {
    sent: proposals.length,
    sentValue: sum(proposals),
    accepted: accepted.length,
    acceptedValue: sum(accepted),
    declined: declined.length,
    waiting: waiting.length,
    waitingValue: sum(waiting),
    acceptRate: rate(accepted.length, accepted.length + declined.length),
    daysToDecision: median(
      [...accepted, ...declined].filter((p) => p.decided_on).map((p) => daysBetween(p.sent_on, p.decided_on!))
    ),
  };
}

export type CampaignNumbers = {
  people: number;
  sent: number;
  replies: number;
  /** Journeys that got at least as far as a meeting, a proposal, or a won client / active partner. */
  meetings: number;
  proposals: number;
  won: number;
};

/** One campaign's results: its journeys (with stage history) and its touches. */
export function campaignNumbers(
  journeys: (InsightJourney & { person_id: string | null })[],
  history: Map<string, InsightHistory[]>,
  touches: (InsightTouch & { person_ids: string[] })[]
): CampaignNumbers {
  const people = new Set<string>();
  for (const j of journeys) if (j.person_id) people.add(j.person_id);
  for (const t of touches) for (const p of t.person_ids) people.add(p);
  const sent = touches.filter((t) => t.direction === "out");
  const reached = (j: InsightJourney, stage: { client: number; partner: number }) =>
    isTrack(j.track) && furthest(j, history) >= stage[j.track];
  return {
    people: people.size,
    sent: sent.length,
    replies: sent.filter((t) => t.outcome && REPLIED.has(t.outcome)).length,
    meetings: journeys.filter((j) => reached(j, { client: 2, partner: 2 })).length,
    proposals: journeys.filter((j) => j.track === "client" && reached(j, { client: 3, partner: 99 })).length,
    won: journeys.filter((j) => reached(j, { client: STAGES.client.length - 1, partner: STAGES.partner.length - 1 })).length,
  };
}

export type InsightReferral = { direction: string; status: string; closed_value: number | null; member: string };

export type MemberReferrals = { name: string; given: number; received: number; givenValue: number; receivedValue: number };

export type ReferralStats = {
  given: number;
  received: number;
  /** Business members closed from referrals Zander gave them (their TYFCB to him). */
  givenValue: number;
  /** Business Zander won from referrals members gave him. */
  receivedValue: number;
  receivedWon: number;
  byMember: MemberReferrals[];
};

export function referralStats(referrals: InsightReferral[]): ReferralStats {
  const value = (r: InsightReferral) => (r.status === "won" ? (r.closed_value ?? 0) : 0);
  const members = new Map<string, MemberReferrals>();
  for (const r of referrals) {
    const m = members.get(r.member) ?? { name: r.member, given: 0, received: 0, givenValue: 0, receivedValue: 0 };
    if (r.direction === "given") {
      m.given++;
      m.givenValue += value(r);
    } else {
      m.received++;
      m.receivedValue += value(r);
    }
    members.set(r.member, m);
  }
  const given = referrals.filter((r) => r.direction === "given");
  const received = referrals.filter((r) => r.direction === "received");
  return {
    given: given.length,
    received: received.length,
    givenValue: given.reduce((n, r) => n + value(r), 0),
    receivedValue: received.reduce((n, r) => n + value(r), 0),
    receivedWon: received.filter((r) => r.status === "won").length,
    byMember: [...members.values()].sort(
      (a, b) => b.given + b.received - (a.given + a.received) || a.name.localeCompare(b.name)
    ),
  };
}

export type Headline = { journeys: number; won: number; winRate: number | null; inPlay: number; inPlayValue: number };

/** Journeys started, won (client / active partner), win rate of decided journeys, and what's still in play. */
export function headline(journeys: InsightJourney[], history: Map<string, InsightHistory[]>, track: Track): Headline {
  const own = journeys.filter((j) => j.track === track);
  const lastStage = STAGES[track][STAGES[track].length - 1].key;
  const won = own.filter((j) => furthest(j, history) >= STAGES[track].length - 1);
  const closed = own.filter((j) => j.status === "lost").length + won.length;
  const inPlay = own.filter((j) => j.status === "open" && j.stage !== lastStage);
  return {
    journeys: own.length,
    won: won.length,
    winRate: rate(won.length, closed),
    inPlay: inPlay.length,
    inPlayValue: inPlay.reduce((sum, j) => sum + (j.value_estimate ?? 0), 0),
  };
}
