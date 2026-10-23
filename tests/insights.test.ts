import { describe, it, expect } from "vitest";
import {
  bySource,
  byReferrer,
  fallOut,
  funnel,
  headline,
  historyByJourney,
  median,
  oneToOnesPerWeek,
  outreach,
  proposalStats,
  speed,
  type InsightHistory,
  type InsightJourney,
  type InsightTouch,
} from "@/lib/crm/insights";
import { isDormantPartner, unansweredStreak } from "@/lib/crm/today";

const j = (over: Partial<InsightJourney> & { id: string }): InsightJourney => ({
  track: "client",
  stage: "prospect",
  status: "open",
  exit_stage: null,
  exit_reason: null,
  exit_side: null,
  source: null,
  referred_by: null,
  opened_at: "2026-10-01T08:00:00Z",
  value_estimate: null,
  fit_score: null,
  ...over,
});

// Six client journeys: two still prospects, one lost after contact (our side),
// one parked at meeting, one at proposal, one won.
const JOURNEYS: InsightJourney[] = [
  j({ id: "a", source: "BNI chapter visitor" }),
  j({ id: "b", source: "BNI chapter visitor" }),
  j({ id: "c", status: "lost", stage: "contacted", exit_stage: "contacted", exit_reason: "Follow-up too slow or missed", exit_side: "ours", source: "Cold outreach", fit_score: 75 }),
  j({ id: "d", status: "parked", stage: "meeting", exit_stage: "meeting", exit_reason: "Bad timing", exit_side: "theirs", source: "Referral", referred_by: "Gerhard Venter" }),
  j({ id: "e", stage: "proposal", source: "Referral", referred_by: "Gerhard Venter", value_estimate: 7500 }),
  j({ id: "f", stage: "client", source: "BNI chapter visitor", value_estimate: 7500, fit_score: 88 }),
  j({ id: "p", track: "partner", stage: "active" }),
];

const HISTORY: InsightHistory[] = [
  { journey_id: "c", to_stage: "prospect", changed_at: "2026-10-01T08:00:00Z" },
  { journey_id: "c", to_stage: "contacted", changed_at: "2026-10-04T08:00:00Z" },
  { journey_id: "f", to_stage: "prospect", changed_at: "2026-09-01T08:00:00Z" },
  { journey_id: "f", to_stage: "contacted", changed_at: "2026-09-03T08:00:00Z" },
  { journey_id: "f", to_stage: "meeting", changed_at: "2026-09-10T08:00:00Z" },
  { journey_id: "f", to_stage: "proposal", changed_at: "2026-09-12T08:00:00Z" },
  { journey_id: "f", to_stage: "client", changed_at: "2026-09-20T08:00:00Z" },
];

const t = (over: Partial<InsightTouch>): InsightTouch => ({
  type: "email",
  direction: "out",
  outcome: "no_reply",
  occurred_at: "2026-10-05T08:00:00Z",
  journey_id: null,
  meeting_setting: null,
  campaign: null,
  ...over,
});

describe("insights", () => {
  const history = historyByJourney(HISTORY);

  it("counts how many journeys reached each stage, and the step-to-step rate", () => {
    const steps = funnel(JOURNEYS, history, "client");
    expect(steps.map((s) => [s.key, s.reached])).toEqual([
      ["prospect", 6], ["contacted", 4], ["meeting", 3], ["proposal", 2], ["client", 1],
    ]);
    expect(steps[1].fromPrevious).toBeCloseTo(4 / 6);
    expect(steps[0].fromPrevious).toBeNull();
    expect(steps[1]).toMatchObject({ lost: 1, open: 0 });
    expect(steps[2]).toMatchObject({ parked: 1 });
  });

  it("ranks sources and introducers by what they turned into", () => {
    expect(bySource(JOURNEYS, history, "client")).toEqual([
      { name: "BNI chapter visitor", journeys: 3, meetings: 1, won: 1, winRate: 1 / 3, wonValue: 7500 },
      { name: "Referral", journeys: 2, meetings: 2, won: 0, winRate: 0, wonValue: 0 },
      { name: "Cold outreach", journeys: 1, meetings: 0, won: 0, winRate: 0, wonValue: 0 },
    ]);
    expect(byReferrer(JOURNEYS, history, "client")).toEqual([
      { name: "Gerhard Venter", journeys: 2, meetings: 2, won: 0, winRate: 0, wonValue: 0 },
    ]);
  });

  it("measures outreach by channel and by campaign", () => {
    const touches = [
      t({ campaign: "Accountants" }),
      t({ campaign: "Accountants", outcome: "replied" }),
      t({ type: "whatsapp", outcome: "meeting_booked" }),
      t({ direction: "in", outcome: "replied" }),
      t({ type: "meeting", direction: null, outcome: null }),
    ];
    expect(outreach(touches, "channel")).toEqual([
      { name: "Email", sent: 2, replies: 1, meetings: 0, replyRate: 0.5, meetingRate: 0 },
      { name: "WhatsApp", sent: 1, replies: 1, meetings: 1, replyRate: 1, meetingRate: 1 },
    ]);
    expect(outreach(touches, "campaign")).toEqual([
      { name: "Accountants", sent: 2, replies: 1, meetings: 0, replyRate: 0.5, meetingRate: 0 },
    ]);
  });

  it("splits where journeys ended into our side and their side, with the fit check", () => {
    const f = fallOut(JOURNEYS, history, "client");
    expect(f.byStage.find((s) => s.key === "contacted")).toMatchObject({ ours: 1, theirs: 0 });
    expect(f.reasons).toEqual([{ reason: "Follow-up too slow or missed", side: "ours", count: 1 }]);
    expect(f.fit).toEqual([
      { bucket: "strong", won: 1, lost: 1 },
      { bucket: "weak", won: 0, lost: 0 },
      { bucket: "unchecked", won: 0, lost: 0 },
    ]);
  });

  it("measures speed from the stage history and first message", () => {
    const s = speed(JOURNEYS, history, [t({ journey_id: "c", occurred_at: "2026-10-03T08:00:00Z" })], "client");
    expect(s.firstContactDays).toBe(2);
    expect(s.stageDays.find((d) => d.key === "prospect")).toEqual({ key: "prospect", label: "Prospect", days: 2.5, journeys: 2 });
    expect(s.stageDays.find((d) => d.key === "proposal")).toMatchObject({ days: 8, journeys: 1 });
  });

  it("gives the headline numbers", () => {
    expect(headline(JOURNEYS, history, "client")).toEqual({ journeys: 6, won: 1, winRate: 0.5, inPlay: 3, inPlayValue: 7500 });
    expect(headline(JOURNEYS, history, "partner")).toMatchObject({ journeys: 1, won: 1, inPlay: 0 });
  });

  it("counts BNI one-to-ones per week, Monday to Sunday, South African time", () => {
    const weeks = oneToOnesPerWeek(
      [
        t({ type: "meeting", direction: null, meeting_setting: "bni_one_to_one", occurred_at: "2026-10-19T06:00:00Z" }),
        t({ type: "meeting", direction: null, meeting_setting: "bni_one_to_one", occurred_at: "2026-10-22T06:00:00Z" }),
        t({ type: "meeting", direction: null, meeting_setting: "online", occurred_at: "2026-10-22T06:00:00Z" }),
        // Sunday 23:30 in Johannesburg is still the previous week.
        t({ type: "meeting", direction: null, meeting_setting: "bni_one_to_one", occurred_at: "2026-10-18T21:30:00Z" }),
      ],
      "2026-10-23",
      3
    );
    expect(weeks).toEqual([
      { week: "2026-10-05", count: 0 },
      { week: "2026-10-12", count: 1 },
      { week: "2026-10-19", count: 2 },
    ]);
  });

  it("sums up proposals: values, acceptance rate and days to a decision", () => {
    expect(
      proposalStats([
        { status: "accepted", value: 7500, sent_on: "2026-10-01", decided_on: "2026-10-05" },
        { status: "declined", value: 12000, sent_on: "2026-10-02", decided_on: "2026-10-12" },
        { status: "accepted", value: 9000, sent_on: "2026-10-03", decided_on: "2026-10-09" },
        { status: "sent", value: 7500, sent_on: "2026-10-20", decided_on: null },
      ])
    ).toEqual({
      sent: 4,
      sentValue: 36000,
      accepted: 2,
      acceptedValue: 16500,
      declined: 1,
      waiting: 1,
      waitingValue: 7500,
      acceptRate: 2 / 3,
      daysToDecision: 6,
    });
    expect(proposalStats([])).toMatchObject({ sent: 0, acceptRate: null, daysToDecision: null });
  });

  it("takes medians of odd and even lists", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("Today additions", () => {
  it("counts unanswered messages since the last reply", () => {
    const out = (day: string, outcome: string | null = "no_reply") => ({ direction: "out", outcome, occurred_at: `2026-10-${day}T08:00:00Z` });
    expect(unansweredStreak([out("01"), out("05"), out("09")])).toBe(3);
    expect(unansweredStreak([out("01"), out("05", "replied"), out("09"), out("12", null)])).toBe(2);
    expect(unansweredStreak([out("01"), { direction: "in", outcome: null, occurred_at: "2026-10-10T08:00:00Z" }])).toBe(0);
  });

  it("calls an active partner dormant after 90 days without contact", () => {
    const partner = { status: "open", track: "partner", stage: "active", stage_changed_at: null, opened_at: null, parked_until: null };
    expect(isDormantPartner({ ...partner, last_touch_at: "2026-07-26T08:00:00Z" }, "2026-10-23")).toBe(false); // 89 days
    expect(isDormantPartner({ ...partner, last_touch_at: "2026-07-20T08:00:00Z" }, "2026-10-23")).toBe(true);
    expect(isDormantPartner({ ...partner, stage: "one_to_one", last_touch_at: "2026-01-01T08:00:00Z" }, "2026-10-23")).toBe(false);
  });
});
