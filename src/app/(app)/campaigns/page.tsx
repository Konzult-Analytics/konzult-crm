import Link from "next/link";
import CalendarStatus from "@/components/CalendarStatus";
import Connections from "@/components/Connections";
import CopyButton from "@/components/CopyButton";
import QrCode from "@/components/QrCode";
import { ReferralForm, ReferralList } from "@/components/Referrals";
import { requireMfaSession } from "@/lib/auth/guard";
import { loadCalendar } from "@/lib/calendar/feed";
import { loadReferrals, oneToOneTarget, oneToOnesThisWeek } from "@/lib/crm/bni";
import { BOOKING_SOURCES, bookingUrl } from "@/lib/crm/booking-links";
import { bookingSettings } from "@/lib/crm/booking-settings";
import { addDays, formatDate, saDate } from "@/lib/crm/dates";
import { bookingStats, campaignNumbers, historyByJourney, pct, referralStats, type InsightJourney } from "@/lib/crm/insights";
import { CAMPAIGN_CHANNELS, labelOf } from "@/lib/crm/labels";
import { personOptions } from "@/lib/crm/lookups";
import { rands } from "@/lib/crm/money";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { BookingSettingsForm, CampaignForm, TargetForm } from "./CampaignForms";

const TABS = [
  { key: "campaigns", label: "Campaigns" },
  { key: "bni", label: "BNI" },
  { key: "booking", label: "Booking" },
  { key: "connections", label: "Connections" },
] as const;

/** The Booking tab's numbers cover this many days. */
const BOOKING_DAYS = 90;

type Supabase = Awaited<ReturnType<typeof requireMfaSession>>["supabase"];

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: requested } = await searchParams;
  const tab = TABS.find((t) => t.key === requested)?.key ?? "campaigns";
  const { supabase } = await requireMfaSession();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <div className="chips" role="tablist" aria-label="Campaign manager">
          {TABS.map((t) => (
            <Link key={t.key} href={`/campaigns?tab=${t.key}`} role="tab" aria-selected={t.key === tab} className="chip">
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      {tab === "campaigns" && <Campaigns supabase={supabase} />}
      {tab === "bni" && <Bni supabase={supabase} />}
      {tab === "booking" && <Booking supabase={supabase} />}
      {tab === "connections" && <InboundConnections supabase={supabase} />}
    </div>
  );
}

async function Campaigns({ supabase }: { supabase: Supabase }) {
  const [{ data: campaigns }, { data: journeys }, { data: history }, { data: touches }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, track, channel, started_on, message, notes, active, created_at")
      .order("active", { ascending: false })
      .order("started_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    fetchAll((from, to) =>
      supabase
        .from("journeys")
        .select("id, campaign_id, person_id, track, stage, status, exit_stage")
        .not("campaign_id", "is", null)
        .order("id")
        .range(from, to)
    ),
    fetchAll((from, to) =>
      supabase.from("journey_stage_history").select("journey_id, to_stage, changed_at").order("id").range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from("interactions")
        .select("type, direction, outcome, occurred_at, journey_id, meeting_setting, campaign_id, interaction_people(person_id)")
        .not("campaign_id", "is", null)
        .order("id")
        .range(from, to)
    ),
  ]);
  const historyMap = historyByJourney(history);
  const numbers = (campaignId: string) =>
    campaignNumbers(
      journeys
        .filter((j) => j.campaign_id === campaignId)
        .map(
          (j): InsightJourney & { person_id: string | null } => ({
            ...j,
            exit_reason: null,
            exit_side: null,
            source: null,
            referred_by: null,
            opened_at: null,
            value_estimate: null,
            fit_score: null,
          })
        ),
      historyMap,
      touches
        .filter((t) => t.campaign_id === campaignId)
        .map((t) => ({ ...t, campaign: null, person_ids: t.interaction_people.map((p) => p.person_id) }))
    );

  return (
    <>
      <p className="text-sm text-ink-soft">
        Each outreach push and how it&apos;s going. Tag a campaign when you log a touch or send from a person&apos;s page;
        imported outreach sheets become campaigns automatically.
      </p>
      {(campaigns ?? []).length === 0 ? (
        <p className="card text-sm text-ink-soft">No campaigns yet. Add one below, or import an outreach sheet.</p>
      ) : (
        <ul className="space-y-3">
          {(campaigns ?? []).map((c) => {
            const n = numbers(c.id);
            return (
              <li key={c.id} className="card space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="badge">{c.track === "partner" ? "Partners" : "Clients"}</span>
                  {c.channel && <span className="badge">{labelOf(CAMPAIGN_CHANNELS, c.channel)}</span>}
                  {!c.active && <span className="badge">Finished</span>}
                  {c.started_on && <span className="text-xs text-ink-soft">since {formatDate(c.started_on)}</span>}
                </div>
                <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
                  {[
                    ["People", String(n.people)],
                    ["Messages", String(n.sent)],
                    ["Replies", `${n.replies}${n.sent ? ` (${pct(n.replies / n.sent)})` : ""}`],
                    [c.track === "partner" ? "One-to-ones" : "Meetings", String(n.meetings)],
                    ...(c.track === "client" ? [["Proposals", String(n.proposals)]] : []),
                    [c.track === "partner" ? "Active" : "Clients", String(n.won)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-ink-soft">{label}</dt>
                      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <details>
                  <summary className="cursor-pointer text-sm">Edit</summary>
                  <div className="mt-3">
                    <CampaignForm campaign={c} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">New campaign</summary>
        <div className="mt-4">
          <CampaignForm campaign={null} />
        </div>
      </details>
    </>
  );
}

async function Bni({ supabase }: { supabase: Supabase }) {
  const today = saDate();
  const [target, thisWeek, referrals, people] = await Promise.all([
    oneToOneTarget(supabase),
    oneToOnesThisWeek(supabase, today),
    loadReferrals(supabase),
    personOptions(supabase),
  ]);
  const stats = referralStats(referrals.map((r) => ({ ...r, member: r.member })));

  return (
    <>
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">One-to-ones</h2>
        <p className="text-sm">
          This week: <span className="font-semibold tabular-nums">{thisWeek}</span>
          {target.on ? (
            <>
              {" "}
              of <span className="tabular-nums">{target.target}</span>
              {thisWeek >= target.target ? " · target met" : ` · ${target.target - thisWeek} to go`}
            </>
          ) : (
            " (no target set)"
          )}
        </p>
        <TargetForm target={target.target} on={target.on} />
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Referrals</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Received", String(stats.received), `${stats.receivedWon} became ${stats.receivedWon === 1 ? "a client" : "clients"}`],
            ["Business from them", rands(stats.receivedValue), "you closed"],
            ["Given", String(stats.given), "to members"],
            ["Business you gave", rands(stats.givenValue), "they closed (TYFCB)"],
          ].map(([label, value, note]) => (
            <div key={label}>
              <dt className="text-xs text-ink-soft">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              <dd className="text-xs text-ink-soft">{note}</dd>
            </div>
          ))}
        </dl>
        {stats.byMember.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-soft">
                  <th className="py-1 pr-3 font-medium">Member</th>
                  <th className="py-1 pr-3 text-right font-medium">Gave you</th>
                  <th className="py-1 pr-3 text-right font-medium">You gave</th>
                  <th className="py-1 text-right font-medium">Business both ways</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stats.byMember.map((m) => (
                  <tr key={m.name}>
                    <td className="py-1.5 pr-3">{m.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{m.received}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{m.given}</td>
                    <td className="py-1.5 text-right tabular-nums">{rands(m.givenValue + m.receivedValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">Record a referral</summary>
          <div className="mt-3">
            <ReferralForm people={people} />
          </div>
        </details>
        <ReferralList referrals={referrals} />
      </section>
    </>
  );
}

async function Booking({ supabase }: { supabase: Supabase }) {
  const since = `${addDays(saDate(), -BOOKING_DAYS)}T00:00:00+02:00`;
  const [{ page, types }, { data: rows }] = await Promise.all([
    bookingSettings(supabase),
    fetchAll((from, to) =>
      supabase.from("bookings").select("status, outcome, source, starts_at").gte("created_at", since).order("id").range(from, to)
    ),
  ]);
  const stats = bookingStats(rows);

  return (
    <>
      <p className="text-sm text-ink-soft">
        Your Cal.com booking links. Each QR code opens the booking page on the other person&apos;s phone; bookings from it
        are marked &ldquo;QR code&rdquo; so you can see what the code brings in. Cal.com only offers times your Google
        Calendar shows as free.
      </p>
      {page && types.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {types.map((t) => {
            const qr = bookingUrl(page, t.slug, { source: "qr" });
            const plain = bookingUrl(page, t.slug);
            return (
              <li key={t.slug} className="card flex gap-4">
                <QrCode text={qr} label={`QR code for booking a ${t.label}`} className="h-28 w-28 shrink-0 rounded" />
                <div className="min-w-0 space-y-2 text-sm">
                  <p className="font-medium">{t.label}</p>
                  <p className="break-all text-xs text-ink-soft">{plain}</p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/qr?type=${t.slug}`} className="btn btn-accent btn-sm">
                      Show full screen
                    </Link>
                    <a href={`/qr/download?type=${t.slug}`} className="btn btn-ghost btn-sm">
                      Download for print
                    </a>
                    <CopyButton text={plain} label="Copy link" />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="card text-sm text-ink-soft">Add your Cal.com page and event types below to get Book buttons and QR codes.</p>
      )}

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Last {BOOKING_DAYS} days</h2>
        {stats.booked === 0 ? (
          <p className="text-sm text-ink-soft">No bookings yet.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Booked", String(stats.booked), `${stats.cancelled} cancelled`],
              ["Happened", String(stats.held), `${stats.noShow} didn't show`],
              ["Show-up rate", pct(stats.showRate), "of those logged"],
              ...stats.bySource.map((s) => [labelOf(BOOKING_SOURCES, s.source), String(s.booked), `${s.held} happened`]),
            ].map(([label, value, note]) => (
              <div key={label}>
                <dt className="text-xs text-ink-soft">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                <dd className="text-xs text-ink-soft">{note}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">Booking page and event types</summary>
        <div className="mt-4">
          <BookingSettingsForm page={page} types={types} />
        </div>
      </details>
    </>
  );
}

async function InboundConnections({ supabase }: { supabase: Supabase }) {
  const today = saDate();
  const [{ data: connections }, calendar] = await Promise.all([
    supabase
      .from("inbound_connections")
      .select("id, kind, key_hint, created_at, revoked_at, last_event_at, last_event_status")
      .order("created_at", { ascending: false }),
    loadCalendar(new Date(`${today}T00:00:00+02:00`), new Date(`${addDays(today, 1)}T00:00:00+02:00`)),
  ]);
  return (
    <>
      <p className="text-sm text-ink-soft">
        Bookings and website enquiries come in through these. Each has its own secret key; the CRM keeps only a fingerprint
        of it, and checks every message&apos;s signature. Switch a key off at any time.
      </p>
      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">Google Calendar</h2>
        <CalendarStatus state={calendar.state} readAt={calendar.readAt} />
      </section>
      <Connections connections={connections ?? []} />
    </>
  );
}
