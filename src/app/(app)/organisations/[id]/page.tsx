import Link from "next/link";
import { notFound } from "next/navigation";
import ClientCare from "@/components/ClientCare";
import JourneyControls from "@/components/JourneyControls";
import Proposals from "@/components/Proposals";
import { requireMfaSession } from "@/lib/auth/guard";
import { exitReasonOptions } from "@/lib/crm/lookups";
import { daysAgo, saDate } from "@/lib/crm/dates";
import { labelOf, SIZE_BANDS, TURNOVER_BANDS } from "@/lib/crm/labels";
import { personName } from "@/lib/crm/people";
import { TRACK_LABEL, isTrack, stageLabel } from "@/lib/crm/stages";
import { updateOrganisation } from "../actions";
import OrganisationForm from "../OrganisationForm";

export default async function OrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMfaSession();

  const { data: org } = await supabase
    .from("organisations")
    .select("id, name, industry, city, website, size_band, turnover_band, notes")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const [{ data: people }, { data: journeys }, { data: details }, { data: proposals }, reasons] = await Promise.all([
    supabase.from("people").select("id, first_name, last_name, role_title").eq("organisation_id", id).order("first_name"),
    supabase
      .from("journey_overview")
      .select("id, person_id, display_name, track, stage, status, last_touch_at, exit_reason, exit_side, parked_until, client_status")
      .eq("organisation_id", id)
      .order("opened_at"),
    // Business-only journeys are managed here, so they need their care and proposal details.
    supabase
      .from("journeys")
      .select("id, testimonial_status, testimonial_quote, referral_status")
      .eq("organisation_id", id)
      .is("person_id", null),
    supabase
      .from("proposals")
      .select("id, journey_id, title, value, sent_on, status, decided_on, notes, journeys!inner(organisation_id, person_id)")
      .eq("journeys.organisation_id", id)
      .is("journeys.person_id", null)
      .order("sent_on"),
    exitReasonOptions(supabase),
  ]);

  const today = saDate();
  const { id: orgId, ...values } = org;
  const facts = [
    org.industry,
    org.city,
    labelOf(SIZE_BANDS, org.size_band),
    labelOf(TURNOVER_BANDS, org.turnover_band) && `Turnover ${labelOf(TURNOVER_BANDS, org.turnover_band)}`,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <section className="card space-y-2">
        <h1 className="break-words text-2xl font-semibold">{org.name}</h1>
        {facts.length > 0 && <p className="text-sm text-ink-soft">{facts.join(" · ")}</p>}
        {org.website && <p className="break-all text-sm">{org.website}</p>}
        {org.notes && <p className="whitespace-pre-line break-words text-sm">{org.notes}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="section-title">People</h2>
        {(people ?? []).length === 0 ? (
          <p className="card text-sm text-ink-soft">No one linked to this business yet.</p>
        ) : (
          <ul className="card divide-y divide-line p-0">
            {(people ?? []).map((p) => (
              <li key={p.id}>
                <Link href={`/people/${p.id}`} className="block px-4 py-3 hover:bg-paper">
                  <span className="font-medium">{personName(p)}</span>
                  {p.role_title && <span className="text-sm text-ink-soft"> · {p.role_title}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(journeys ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">Journeys</h2>
          <ul className="card divide-y divide-line p-0">
            {(journeys ?? []).map((j) => (
              <li key={j.id} className="space-y-3 px-4 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-accent">{isTrack(j.track) ? TRACK_LABEL[j.track] : j.track}</span>
                  <span className="font-medium">{stageLabel(j.track ?? "", j.stage ?? "")}</span>
                  {j.person_id ? (
                    <Link href={`/people/${j.person_id}`} className="link">
                      {j.display_name}
                    </Link>
                  ) : (
                    <span className="text-ink-soft">the business itself</span>
                  )}
                  <span className="text-ink-soft">
                    · {j.last_touch_at ? `last touch ${daysAgo(j.last_touch_at, today)}` : "no touches yet"}
                  </span>
                </p>
                {/* People's journeys are managed on their own page; business-only ones here. */}
                {!j.person_id && (
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
                )}
                {!j.person_id && j.track === "client" && j.stage === "client" && (
                  <ClientCare
                    journeyId={j.id!}
                    values={{
                      client_status: j.client_status,
                      testimonial_status: null,
                      testimonial_quote: null,
                      referral_status: null,
                      ...(details ?? []).find((d) => d.id === j.id),
                    }}
                  />
                )}
                {!j.person_id && j.track === "client" && (
                  <Proposals
                    journeyId={j.id!}
                    journeyOpen={j.status === "open"}
                    proposals={(proposals ?? []).filter((p) => p.journey_id === j.id)}
                    reasons={reasons}
                  />
                )}
                {j.person_id && j.status !== "open" && <span className="badge">{j.status}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">Edit details</summary>
        <div className="mt-4">
          <OrganisationForm action={updateOrganisation.bind(null, orgId)} values={values} submitLabel="Save changes" />
        </div>
      </details>
    </div>
  );
}
