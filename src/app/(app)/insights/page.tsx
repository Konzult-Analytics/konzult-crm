import Link from "next/link";
import { requireMfaSession } from "@/lib/auth/guard";
import { addDays, formatDate, saDate } from "@/lib/crm/dates";
import {
  STRONG_FIT,
  bySource,
  byReferrer,
  fallOut,
  funnel,
  headline,
  historyByJourney,
  oneToOnesPerWeek,
  outreach,
  pct,
  proposalStats,
  referralStats,
  speed,
  type InsightTouch,
  type OutreachRow,
  type SourceRow,
} from "@/lib/crm/insights";
import { oneToOneTarget } from "@/lib/crm/bni";
import { rands } from "@/lib/crm/money";
import { TRACKS, TRACK_LABEL, isTrack } from "@/lib/crm/stages";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { Bar, Empty, Figure, SplitBar, Stat } from "./charts";

const PERIODS = [
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "12 months", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-ink-soft">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function SourceTable({
  rows,
  first,
  wonLabel,
  showValue,
}: {
  rows: SourceRow[];
  first: string;
  wonLabel: string;
  showValue: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.journeys), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-soft">
            <th className="py-1 pr-3 font-medium">{first}</th>
            <th className="w-1/4 py-1 pr-3 font-medium">Journeys</th>
            <th className="py-1 pr-3 text-right font-medium">Meetings</th>
            <th className="py-1 pr-3 text-right font-medium">{wonLabel}</th>
            <th className="py-1 pr-3 text-right font-medium" title={`Share of these journeys that reached ${wonLabel.toLowerCase()}`}>
              Conversion
            </th>
            {showValue && <th className="py-1 text-right font-medium">Won value</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="py-2 pr-3">{r.name}</td>
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2">
                  <Bar value={r.journeys} max={max} title={`${r.name}: ${r.journeys} journeys`} />
                  <span className="tabular-nums">{r.journeys}</span>
                </span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.meetings}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.won}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{pct(r.winRate)}</td>
              {showValue && <td className="py-2 text-right tabular-nums">{r.wonValue ? rands(r.wonValue) : "–"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutreachTable({ rows, first }: { rows: OutreachRow[]; first: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-soft">
            <th className="py-1 pr-3 font-medium">{first}</th>
            <th className="py-1 pr-3 text-right font-medium">Sent</th>
            <th className="py-1 pr-3 text-right font-medium">Replies</th>
            <th className="w-1/3 py-1 pr-3 font-medium">Reply rate</th>
            <th className="py-1 text-right font-medium">Meetings</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="py-2 pr-3">{r.name}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.sent}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.replies}</td>
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2">
                  <Bar value={r.replyRate ?? 0} max={1} title={`${r.name}: ${pct(r.replyRate)} replied`} />
                  <span className="w-10 text-right tabular-nums">{pct(r.replyRate)}</span>
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">
                {r.meetings} <span className="text-ink-soft">({pct(r.meetingRate)})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string; period?: string }>;
}) {
  const params = await searchParams;
  const track = isTrack(params.track) ? params.track : "client";
  const period = PERIODS.find((p) => p.key === params.period) ?? PERIODS[2];
  const today = saDate();
  const sinceDate = period.days ? addDays(today, -period.days) : null;
  const since = sinceDate ? `${sinceDate}T00:00:00+02:00` : null;
  const { supabase } = await requireMfaSession();

  const [
    { data: journeyRows, error },
    { data: historyRows },
    { data: touchRows },
    { data: oneToOneRows },
    { data: proposalRows },
  ] = await Promise.all([
      fetchAll((from, to) => {
        const q = supabase
          .from("journey_overview")
          .select("id, track, stage, status, exit_stage, exit_reason, exit_side, source, referred_by, opened_at, value_estimate, fit_score")
          .order("id")
          .range(from, to);
        return since ? q.gte("opened_at", since) : q;
      }),
      fetchAll((from, to) =>
        supabase.from("journey_stage_history").select("journey_id, to_stage, changed_at").order("id").range(from, to)
      ),
      fetchAll((from, to) => {
        const q = supabase
          .from("interactions")
          .select("type, direction, outcome, occurred_at, journey_id, meeting_setting, campaigns(name)")
          .order("id")
          .range(from, to);
        return since ? q.gte("occurred_at", since) : q;
      }),
      // The weekly one-to-one chart always covers the last 8 weeks.
      supabase
        .from("interactions")
        .select("type, direction, outcome, occurred_at, journey_id, meeting_setting")
        .eq("meeting_setting", "bni_one_to_one")
        .gte("occurred_at", `${addDays(today, -63)}T00:00:00+02:00`),
      fetchAll((from, to) => {
        const q = supabase.from("proposals").select("status, value, sent_on, decided_on").order("id").range(from, to);
        return sinceDate ? q.gte("sent_on", sinceDate) : q;
      }),
    ]);
  if (error) console.error("insights failed", error);

  const journeys = (journeyRows ?? []).map((j) => ({ ...j, id: j.id! }));
  const history = historyByJourney(historyRows ?? []);
  const touches: InsightTouch[] = (touchRows ?? []).map((t) => ({ ...t, campaign: t.campaigns?.name ?? null }));
  const trackJourneyIds = new Set(journeys.filter((j) => j.track === track).map((j) => j.id));
  const trackTouches = touches.filter((t) => t.journey_id && trackJourneyIds.has(t.journey_id));

  const head = headline(journeys, history, track);
  const steps = funnel(journeys, history, track);
  const sources = bySource(journeys, history, track);
  const referrers = byReferrer(journeys, history, track);
  const channels = outreach(trackTouches, "channel");
  const campaigns = outreach(trackTouches, "campaign");
  const ends = fallOut(journeys, history, track);
  const pace = speed(journeys, history, touches, track);
  const offers = proposalStats(proposalRows);
  const [target, { data: referralRows }] = await Promise.all([
    oneToOneTarget(supabase),
    fetchAll((from, to) => {
      const q = supabase
        .from("referrals")
        .select("direction, status, closed_value, member:people!referrals_workspace_id_member_person_id_fkey(first_name, last_name)")
        .order("id")
        .range(from, to);
      return sinceDate ? q.gte("referred_on", sinceDate) : q;
    }),
  ]);
  const referrals = referralStats(
    referralRows.map((r) => ({ ...r, member: [r.member?.first_name, r.member?.last_name].filter(Boolean).join(" ") }))
  );
  const weeks = oneToOnesPerWeek(
    (oneToOneRows ?? []).map((t) => ({ ...t, campaign: null })),
    today
  );

  const isClient = track === "client";
  const wonLabel = isClient ? "Won" : "Active";
  const firstStep = steps[0]?.reached ?? 0;
  const lostTotal = ends.byStage.reduce((n, s) => n + s.ours + s.theirs, 0);
  const lostMax = Math.max(...ends.byStage.map((s) => s.ours + s.theirs), 1);
  const weekMax = Math.max(...weeks.map((w) => w.count), target.on ? target.target : 0, 1);
  const href = (change: { track?: string; period?: string }) =>
    `/insights?track=${change.track ?? track}&period=${change.period ?? period.key}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Insights</h1>
          <p className="text-sm text-ink-soft">
            {period.days ? `Journeys started since ${formatDate(addDays(today, -period.days))}` : "Every journey so far"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="chips" role="tablist" aria-label="Track">
            {TRACKS.map((t) => (
              <Link key={t} href={href({ track: t })} role="tab" aria-selected={t === track} className="chip">
                {TRACK_LABEL[t]}s
              </Link>
            ))}
          </div>
          <div className="chips" role="tablist" aria-label="Period">
            {PERIODS.map((p) => (
              <Link key={p.key} href={href({ period: p.key })} role="tab" aria-selected={p.key === period.key} className="chip">
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Journeys started" value={String(head.journeys)} />
        <Stat label={track === "client" ? "Won as clients" : "Active partners"} value={String(head.won)} />
        <Stat label="Win rate" value={pct(head.winRate)} note={`of journeys ${isClient ? "won" : "made active"} or lost`} />
        <Stat
          label="Still in play"
          value={String(head.inPlay)}
          note={isClient ? (head.inPlayValue ? `${rands(head.inPlayValue)} in deal values` : "no deal values entered yet") : undefined}
        />
      </div>

      <Section title="Funnel" hint="How many journeys reached each stage, and how many of the step before made it.">
        {firstStep === 0 ? (
          <Empty>No {track} journeys in this period yet.</Empty>
        ) : (
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={s.key} className="grid grid-cols-[8rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[10rem_1fr_9rem]">
                <span className="text-sm font-medium">{s.label}</span>
                <span className="flex items-center gap-2">
                  <Bar value={s.reached} max={firstStep} title={`${s.label}: ${s.reached} reached`} />
                  <span className="w-8 text-right text-sm tabular-nums">{s.reached}</span>
                </span>
                <span className="col-start-2 text-xs text-ink-soft sm:col-start-auto">
                  {i > 0 && `${pct(s.fromPrevious)} of previous`}
                  {(s.lost > 0 || s.parked > 0) && `${i > 0 ? " · " : ""}${s.lost} lost, ${s.parked} parked here`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {isClient && (
        <Section title="Proposals" hint="Proposals sent in this period, and how they were decided.">
          {offers.sent === 0 ? (
            <Empty>No proposals sent in this period yet.</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Figure label="Sent" value={String(offers.sent)} note={rands(offers.sentValue)} />
              <Figure label="Accepted" value={String(offers.accepted)} note={rands(offers.acceptedValue)} />
              <Figure
                label="Acceptance rate"
                value={pct(offers.acceptRate)}
                note={`${offers.declined} declined · ${offers.waiting} waiting${offers.waiting ? ` (${rands(offers.waitingValue)})` : ""}`}
              />
              <Figure
                label="Days to a decision"
                value={offers.daysToDecision === null ? "–" : String(offers.daysToDecision)}
                note="typical (median)"
              />
            </div>
          )}
        </Section>
      )}

      <Section title="Where they come from" hint="Each source, and how far its journeys got.">
        {sources.length ? <SourceTable rows={sources} first="Source" wonLabel={wonLabel} showValue={isClient} /> : <Empty>No journeys yet.</Empty>}
        {referrers.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="section-title">Introduced by</h3>
            <SourceTable rows={referrers.slice(0, 10)} first="Person" wonLabel={wonLabel} showValue={isClient} />
          </div>
        )}
      </Section>

      <Section
        title="Is the outreach working?"
        hint="Messages sent and how they were answered: a reply, or a meeting booked."
      >
        {channels.length ? (
          <>
            <OutreachTable rows={channels} first="Channel" />
            {campaigns.length > 0 && (
              <div className="space-y-2 pt-2">
                <h3 className="section-title">By campaign</h3>
                <OutreachTable rows={campaigns} first="Campaign" />
              </div>
            )}
          </>
        ) : (
          <Empty>No messages logged in this period yet.</Empty>
        )}
      </Section>

      <Section
        title="Why journeys end"
        hint="Lost journeys by the stage they ended at. Our side is what we could have done better; their side is not being in the market."
      >
        {lostTotal === 0 ? (
          <Empty>Nothing lost in this period.</Empty>
        ) : (
          <>
            <p className="flex flex-wrap gap-4 text-xs text-ink-soft" aria-label="Legend">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-accent" aria-hidden /> Our side
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-ink-soft/50" aria-hidden /> Their side
              </span>
            </p>
            <ol className="space-y-3">
              {ends.byStage
                .filter((s) => s.ours + s.theirs > 0)
                .map((s) => (
                  <li key={s.key} className="grid grid-cols-[8rem_1fr] items-center gap-3 sm:grid-cols-[10rem_1fr_10rem]">
                    <span className="text-sm font-medium">{s.label}</span>
                    <SplitBar
                      ours={s.ours}
                      theirs={s.theirs}
                      max={lostMax}
                      title={`${s.label}: ${s.ours} our side, ${s.theirs} their side`}
                    />
                    <span className="col-start-2 text-xs text-ink-soft tabular-nums sm:col-start-auto">
                      {s.ours} our side · {s.theirs} their side
                    </span>
                  </li>
                ))}
            </ol>
            <div className="grid gap-4 pt-2 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="section-title">Reasons</h3>
                <ul className="divide-y divide-line text-sm">
                  {ends.reasons.map((r) => (
                    <li key={r.reason} className="flex justify-between gap-3 py-1.5">
                      <span>
                        {r.reason} <span className="text-ink-soft">({r.side === "ours" ? "our side" : "their side"})</span>
                      </span>
                      <span className="tabular-nums">{r.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {track === "client" && (
                <div className="space-y-2">
                  <h3 className="section-title">Did the fit check predict it?</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink-soft">
                        <th className="py-1 font-medium">Fit</th>
                        <th className="py-1 text-right font-medium">Won</th>
                        <th className="py-1 text-right font-medium">Lost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {ends.fit.map((f) => (
                        <tr key={f.bucket}>
                          <td className="py-1.5">
                            {f.bucket === "strong" ? `Strong (${STRONG_FIT}+)` : f.bucket === "weak" ? `Weak (under ${STRONG_FIT})` : "Not checked"}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{f.won}</td>
                          <td className="py-1.5 text-right tabular-nums">{f.lost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-ink-soft">
                    Strong fits that were lost point at us (speed, proposal, material); weak fits that were lost point at
                    targeting.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title="Speed" hint="Typical (median) days, from the stage history.">
        <p className="text-sm">
          From adding someone to the first message:{" "}
          <span className="font-semibold tabular-nums">
            {pace.firstContactDays === null ? "not enough data yet" : `${pace.firstContactDays} days`}
          </span>
        </p>
        <table className="w-full max-w-md text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-soft">
              <th className="py-1 font-medium">Time spent in</th>
              <th className="py-1 text-right font-medium">Days</th>
              <th className="py-1 text-right font-medium">Journeys</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pace.stageDays.map((d) => (
              <tr key={d.key}>
                <td className="py-1.5">{d.label}</td>
                <td className="py-1.5 text-right tabular-nums">{d.days === null ? "–" : d.days}</td>
                <td className="py-1.5 text-right text-ink-soft tabular-nums">{d.journeys}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="BNI" hint="One-to-ones over the last 8 weeks, and referrals in this period.">
        <p className="flex flex-wrap gap-4 text-xs text-ink-soft" aria-label="Legend">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-accent" aria-hidden /> One-to-ones held
          </span>
          {target.on && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed border-ink-soft" aria-hidden /> Weekly target ({target.target})
            </span>
          )}
        </p>
        <div className="pt-5">
          <div className="relative flex h-32 items-end gap-2" role="img" aria-label="One-to-ones per week">
            {weeks.map((w) => {
              const height = (w.count / weekMax) * 100;
              return (
                <div
                  key={w.week}
                  className="relative flex h-full flex-1 items-end justify-center"
                  title={`Week of ${formatDate(w.week)}: ${w.count}${target.on ? ` of ${target.target}` : ""}`}
                >
                  <div className="w-full max-w-6 rounded-t bg-accent" style={{ height: `${height}%`, minHeight: w.count ? "4px" : "0" }} />
                  <span className="absolute text-xs tabular-nums" style={{ bottom: `calc(${height}% + 2px)` }}>
                    {w.count}
                  </span>
                </div>
              );
            })}
            {target.on && (
              <div
                className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-ink-soft/70"
                style={{ bottom: `${(target.target / weekMax) * 100}%` }}
                aria-hidden
              />
            )}
          </div>
        </div>
        <div className="flex gap-2 border-t border-line pt-1">
          {weeks.map((w) => (
            <span key={w.week} className="flex-1 text-center text-[0.65rem] text-ink-soft">
              {formatDate(w.week).replace(/ \d{4}$/, "")}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4 lg:grid-cols-4">
          <Figure label="Referrals received" value={String(referrals.received)} note={`${referrals.receivedWon} became ${referrals.receivedWon === 1 ? "a client" : "clients"}`} />
          <Figure label="Business from them" value={rands(referrals.receivedValue)} note="you closed" />
          <Figure label="Referrals given" value={String(referrals.given)} note="to members" />
          <Figure label="Business you gave" value={rands(referrals.givenValue)} note="they closed (TYFCB)" />
        </div>
      </Section>
    </div>
  );
}
