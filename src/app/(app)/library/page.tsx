import Link from "next/link";
import { archiveDocument } from "@/app/(app)/documents/actions";
import { requireMfaSession } from "@/lib/auth/guard";
import { formatDate } from "@/lib/crm/dates";
import { fileSize } from "@/lib/crm/documents";
import { labelOf } from "@/lib/crm/labels";
import { PURPOSES } from "@/lib/crm/messages";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { AddLibraryItem, NewVersionForm, TemplateForm } from "./LibraryForms";

const TABS = [
  { key: "material", label: "Material" },
  { key: "templates", label: "Templates" },
] as const;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: requested } = await searchParams;
  const tab = requested === "templates" ? "templates" : "material";
  const { supabase } = await requireMfaSession();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Library</h1>
        <div className="chips" role="tablist" aria-label="Library">
          {TABS.map((t) => (
            <Link key={t.key} href={`/library?tab=${t.key}`} role="tab" aria-selected={t.key === tab} className="chip">
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      {tab === "material" ? <Material supabase={supabase} /> : <Templates supabase={supabase} />}
    </div>
  );
}

type Supabase = Awaited<ReturnType<typeof requireMfaSession>>["supabase"];

async function Material({ supabase }: { supabase: Supabase }) {
  const [{ data: items }, { data: sends }, { data: clients }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, url, file_name, size_bytes, version, service, audience, updated_at")
      .eq("is_library", true)
      .eq("archived", false)
      .order("title"),
    fetchAll((from, to) =>
      supabase.from("asset_sends").select("document_id, person_id, open_count").order("id").range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from("journeys")
        .select("person_id")
        .eq("track", "client")
        .eq("stage", "client")
        .order("id")
        .range(from, to)
    ),
  ]);
  const clientIds = new Set((clients ?? []).map((c) => c.person_id));
  const stats = (documentId: string) => {
    const own = (sends ?? []).filter((s) => s.document_id === documentId);
    const people = new Set(own.map((s) => s.person_id));
    return {
      sent: own.length,
      opened: own.filter((s) => s.open_count > 0).length,
      clients: [...people].filter((p) => clientIds.has(p)).length,
    };
  };

  return (
    <>
      <p className="text-sm text-ink-soft">
        Marketing material to send from a person&apos;s page. Each person gets their own link, so you see who opened what.
      </p>
      {(items ?? []).length === 0 ? (
        <p className="card text-sm text-ink-soft">Nothing in the library yet. Add your profile, one-pager or The Map below.</p>
      ) : (
        <ul className="space-y-3">
          {(items ?? []).map((d) => {
            const s = stats(d.id);
            return (
              <li key={d.id} className="card space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <a href={`/documents/${d.id}`} target="_blank" rel="noreferrer" className="link break-words font-medium">
                      {d.title}
                    </a>
                    <p className="text-xs text-ink-soft">
                      {[
                        d.url ? "Link" : [d.file_name, fileSize(d.size_bytes)].filter(Boolean).join(" · "),
                        d.version > 1 && `version ${d.version}`,
                        d.service,
                        d.audience,
                        `updated ${formatDate(d.updated_at)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <form action={archiveDocument}>
                    <input type="hidden" name="document_id" value={d.id} />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Archive
                    </button>
                  </form>
                </div>
                <p className="text-sm tabular-nums">
                  Sent {s.sent} · opened {s.opened}
                  {s.sent > 0 && ` (${Math.round((s.opened / s.sent) * 100)}%)`} · recipients who are clients now: {s.clients}
                </p>
                {!d.url && (
                  <details className="text-sm">
                    <summary className="cursor-pointer">Upload a new version</summary>
                    <NewVersionForm documentId={d.id} />
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Add to the library</h2>
        <AddLibraryItem />
      </section>
    </>
  );
}

async function Templates({ supabase }: { supabase: Supabase }) {
  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, purpose, subject, body, active")
    .order("sort_order")
    .order("name");

  return (
    <>
      <p className="text-sm text-ink-soft">
        Messages you send from a person&apos;s page, opened in your own email or WhatsApp. Marketing ones only go to people
        who agreed or are clients (POPIA s69).
      </p>
      <ul className="space-y-3">
        {(templates ?? []).map((t) => (
          <li key={t.id}>
            <details className="card">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{t.name}</span>{" "}
                <span className="text-ink-soft">
                  · {labelOf(PURPOSES, t.purpose).split(" (")[0]}
                  {!t.active && " · not in use"}
                </span>
              </summary>
              <div className="mt-4">
                <TemplateForm template={t} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">New template</summary>
        <div className="mt-4">
          <TemplateForm template={null} />
        </div>
      </details>
    </>
  );
}
