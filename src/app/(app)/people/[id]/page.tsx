import Link from "next/link";
import { notFound } from "next/navigation";
import AddTaskForm from "@/components/AddTaskForm";
import ClientCare from "@/components/ClientCare";
import Documents from "@/components/Documents";
import FitCheck from "@/components/FitCheck";
import JourneyControls from "@/components/JourneyControls";
import Proposals from "@/components/Proposals";
import SendPanel from "@/components/SendPanel";
import SentLinks from "@/components/SentLinks";
import TaskItem from "@/components/TaskItem";
import Timeline from "@/components/Timeline";
import { requireMfaSession } from "@/lib/auth/guard";
import { daysAgo, formatDate, saDate } from "@/lib/crm/dates";
import { exitReasonOptions, personOptions, sourceOptions } from "@/lib/crm/lookups";
import { personName, whatsappNumber } from "@/lib/crm/people";
import { TRACK_LABEL, TRACKS, isTrack, stageLabel } from "@/lib/crm/stages";
import ConsentControl from "./ConsentControl";
import StartJourneyForm from "./StartJourneyForm";

const NOTICES: Record<string, string> = {
  "journey-failed": "Saved, but the journey didn't start. Start it below.",
};

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ logged?: string; notice?: string }>;
}) {
  const [{ id }, { logged, notice }] = await Promise.all([params, searchParams]);
  const { supabase } = await requireMfaSession();

  const { data: person } = await supabase
    .from("people")
    .select(
      "id, first_name, last_name, email, phone, role_title, bni_chapter, is_bni_member, birthday, notes, marketing_consent, marketing_consent_at, marketing_consent_note, organisations(id, name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!person) notFound();

  const [{ data: journeys }, { data: details }, { data: proposals }, { data: touches }, { data: tasks }, reasons, sources, people] =
    await Promise.all([
      supabase
        .from("journey_overview")
        .select(
          "id, track, stage, status, source, referred_by, campaign, exit_reason, exit_side, parked_until, opened_at, last_touch_at, fit_score, client_status"
        )
        .eq("person_id", id)
        .order("opened_at"),
      supabase
        .from("journeys")
        .select(
          "id, fit_need, fit_timing, fit_budget, fit_decision, chance_pct, value_estimate, testimonial_status, testimonial_quote, referral_status"
        )
        .eq("person_id", id),
      supabase
        .from("proposals")
        .select("id, journey_id, title, value, sent_on, status, decided_on, notes, document_id, journeys!inner(person_id)")
        .eq("journeys.person_id", id)
        .order("sent_on"),
      supabase
        .from("interactions")
        .select(
          "id, type, direction, occurred_at, summary, outcome, meeting_purpose, meeting_setting, next_step, interaction_people!inner(person_id)"
        )
        .eq("interaction_people.person_id", id)
        .order("occurred_at", { ascending: false })
        .limit(100),
      supabase.from("tasks").select("id, title, due_on").eq("person_id", id).eq("status", "open").order("due_on"),
      exitReasonOptions(supabase),
      sourceOptions(supabase),
      personOptions(supabase),
    ]);

  const [{ data: templates }, { data: library }, { data: documents }, { data: sends }, { data: asked }] = await Promise.all([
    supabase.from("templates").select("id, name, purpose, subject, body").eq("active", true).order("sort_order"),
    supabase.from("documents").select("id, title, kind, is_library").eq("is_library", true).eq("archived", false).order("title"),
    supabase
      .from("documents")
      .select("id, title, kind, is_library, file_name, size_bytes, url, version, created_at")
      .eq("person_id", id)
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("asset_sends")
      .select("id, channel, sent_at, open_count, first_opened_at, last_opened_at, revoked_at, expires_at, share_token, documents(title)")
      .eq("person_id", id)
      .order("sent_at", { ascending: false }),
    supabase
      .from("interactions")
      .select("id, templates!inner(purpose), interaction_people!inner(person_id)")
      .eq("interaction_people.person_id", id)
      .eq("templates.purpose", "consent_request")
      .limit(1),
  ]);

  const name = personName(person);
  const wa = whatsappNumber(person.phone);
  const today = saDate();
  const isClient = (journeys ?? []).some(
    (j) => j.track === "client" && j.stage === "client" && j.status === "open" && j.client_status !== "ended"
  );
  const freeTracks = TRACKS.filter(
    (t) => !(journeys ?? []).some((j) => j.track === t && j.status !== "lost")
  );

  return (
    <div className="space-y-6">
      {logged && (
        <p className="card border-accent text-sm" role="status">
          Touch logged.
        </p>
      )}
      {notice && NOTICES[notice] && (
        <p className="card text-sm text-danger" role="status">
          {NOTICES[notice]}
        </p>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold">{name}</h1>
            <p className="text-sm text-ink-soft">
              {[person.role_title, person.organisations?.name].filter(Boolean).join(" at ")}
              {person.organisations && (
                <>
                  {" · "}
                  <Link href={`/organisations/${person.organisations.id}`} className="link">
                    view business
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/log?person=${person.id}`} className="btn btn-accent btn-sm">
              Log a touch
            </Link>
            <Link href={`/people/${person.id}/edit`} className="btn btn-ghost btn-sm">
              Edit
            </Link>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {person.phone && (
            <div>
              <dt className="text-ink-soft">Cell</dt>
              <dd className="flex flex-wrap gap-3">
                <a href={`tel:${person.phone}`} className="link">
                  {person.phone}
                </a>
                {wa && (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="link">
                    WhatsApp
                  </a>
                )}
              </dd>
            </div>
          )}
          {person.email && (
            <div>
              <dt className="text-ink-soft">Email</dt>
              <dd>
                <a href={`mailto:${person.email}`} className="link break-all">
                  {person.email}
                </a>
              </dd>
            </div>
          )}
          {(person.bni_chapter || person.is_bni_member) && (
            <div>
              <dt className="text-ink-soft">BNI</dt>
              <dd>
                {person.is_bni_member ? "Member" : "Not a member"}
                {person.bni_chapter && `, ${person.bni_chapter}`}
              </dd>
            </div>
          )}
          {person.birthday && (
            <div>
              <dt className="text-ink-soft">Birthday</dt>
              <dd>{formatDate(person.birthday)}</dd>
            </div>
          )}
        </dl>
        {person.notes && <p className="whitespace-pre-line break-words text-sm">{person.notes}</p>}
        <div className="border-t border-line pt-3">
          <ConsentControl
            personId={person.id}
            status={person.marketing_consent}
            at={person.marketing_consent_at}
            note={person.marketing_consent_note}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Journeys</h2>
        {(journeys ?? []).map((j) => {
          const detail = (details ?? []).find((d) => d.id === j.id);
          return (
            <div key={j.id} className="card space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-accent">{isTrack(j.track) ? TRACK_LABEL[j.track] : j.track}</span>
                <span className="font-medium">{stageLabel(j.track ?? "", j.stage ?? "")}</span>
                <span className="text-sm text-ink-soft">
                  since {formatDate(j.opened_at)} ·{" "}
                  {j.last_touch_at ? `last touch ${daysAgo(j.last_touch_at, today)}` : "no touches yet"}
                </span>
              </div>
              {(j.source || j.referred_by || j.campaign) && (
                <p className="text-sm text-ink-soft">
                  {[
                    j.source && `Source: ${j.source}`,
                    j.referred_by && `Introduced by ${j.referred_by}`,
                    j.campaign && `Campaign: ${j.campaign}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <JourneyControls
                journey={{
                  id: j.id!,
                  track: j.track ?? "",
                  stage: j.stage ?? "",
                  status: j.status ?? "open",
                  exit_reason: j.exit_reason,
                  exit_side: j.exit_side,
                  parked_until: j.parked_until,
                }}
                reasons={reasons}
              />
              {j.track === "client" && j.stage === "client" && (
                <ClientCare
                  journeyId={j.id!}
                  values={{
                    client_status: j.client_status,
                    testimonial_status: detail?.testimonial_status ?? null,
                    testimonial_quote: detail?.testimonial_quote ?? null,
                    referral_status: detail?.referral_status ?? null,
                  }}
                />
              )}
              {j.track === "client" && (
                <Proposals
                  journeyId={j.id!}
                  journeyOpen={j.status === "open"}
                  proposals={(proposals ?? []).filter((p) => p.journey_id === j.id)}
                  reasons={reasons}
                />
              )}
              {j.track === "client" && (
                <FitCheck
                  journeyId={j.id!}
                  values={{
                    fit_need: detail?.fit_need ?? null,
                    fit_timing: detail?.fit_timing ?? null,
                    fit_budget: detail?.fit_budget ?? null,
                    fit_decision: detail?.fit_decision ?? null,
                    chance_pct: detail?.chance_pct ?? null,
                    value_estimate: detail?.value_estimate ?? null,
                    fit_score: j.fit_score,
                  }}
                />
              )}
            </div>
          );
        })}
        {freeTracks.length > 0 && (
          <details className="card" open={(journeys ?? []).length === 0}>
            <summary className="cursor-pointer text-sm font-medium">Start a journey</summary>
            <div className="mt-3">
              <StartJourneyForm personId={person.id} tracks={freeTracks} sources={sources} people={people} />
            </div>
          </details>
        )}
      </section>

      <SendPanel
        personId={person.id}
        firstName={person.first_name}
        fullName={name}
        business={person.organisations?.name ?? null}
        hasEmail={!!person.email}
        hasWhatsApp={!!wa}
        consent={person.marketing_consent}
        isClient={isClient}
        consentRequestSent={(asked ?? []).length > 0}
        templates={templates ?? []}
        documents={[...(library ?? []), ...(documents ?? [])]}
      />

      {(sends ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">Links sent</h2>
          <SentLinks sends={(sends ?? []).map((s) => ({ ...s, title: s.documents?.title ?? "Document" }))} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="section-title">Documents</h2>
        <Documents
          documents={documents ?? []}
          personId={person.id}
          journeys={(journeys ?? []).map((j) => ({
            id: j.id!,
            label: `${isTrack(j.track) ? TRACK_LABEL[j.track] : j.track} journey · ${stageLabel(j.track ?? "", j.stage ?? "")}`,
          }))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Tasks</h2>
        <div className="card space-y-3 p-0">
          {(tasks ?? []).length > 0 && (
            <ul className="divide-y divide-line">
              {(tasks ?? []).map((t) => (
                <TaskItem key={t.id} task={t} today={today} />
              ))}
            </ul>
          )}
          <div className={`px-4 pb-4 ${(tasks ?? []).length > 0 ? "" : "pt-4"}`}>
            <AddTaskForm personId={person.id} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Timeline</h2>
        <div className="card">
          <Timeline touches={touches ?? []} />
        </div>
      </section>
    </div>
  );
}
