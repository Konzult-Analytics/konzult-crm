"use client";

import { useMemo, useState, useTransition } from "react";
import { addDays, formatDate, saDate } from "@/lib/crm/dates";
import { labelOf, TOUCH_TYPES, type TouchType } from "@/lib/crm/labels";
import type { Match } from "@/lib/import/match";
import type { ImportChoices, SheetChoice } from "@/lib/import/plan";
import type { ParsedRow } from "@/lib/import/types";
import { commitImport, type ImportPreview as Preview, type ImportSummary } from "./actions";

const TRACKS = [
  { key: "client", label: "Possible clients" },
  { key: "partner", label: "Referral partners" },
  { key: "none", label: "Just contacts" },
] as const;

const FIELD_LABEL: Record<string, string> = {
  firstName: "first name",
  lastName: "surname",
  fullName: "name",
  organisation: "business",
  email: "email",
  phone: "cell",
  role: "role",
  city: "town",
  industry: "industry",
  chapter: "BNI chapter",
  notes: "notes",
  contactedOn: "contacted on",
  responded: "reply",
  result: "result",
  channel: "channel",
  subject: "subject",
  invitedBy: "invited by",
  visitorType: "visitor / guest",
};

function campaignFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function rowName(r: ParsedRow): string {
  return [r.firstName, r.lastName].filter(Boolean).join(" ") || r.organisation || "Unnamed";
}

function MatchBadge({ match }: { match: Match | undefined }) {
  if (!match || match.status === "new") return <span className="badge badge-accent">New</span>;
  if (match.status === "existing") {
    const how = { email: "same email", number: "same number", name: "same name" }[match.reason];
    return <span className="badge">Adds to {match.name} ({how})</span>;
  }
  if (match.status === "existing_business") return <span className="badge">Adds to {match.name}</span>;
  return <span className="badge">Same as row {match.row}, merged</span>;
}

export default function ImportPreview({
  preview,
  onDone,
  onCancel,
}: {
  preview: Preview;
  onDone: (summary: ImportSummary) => void;
  onCancel: () => void;
}) {
  const { file, matches, inviters, sources } = preview;
  const sourceId = (label: string) => sources.find((s) => s.label === label)?.id ?? null;

  const [sheets, setSheets] = useState<SheetChoice[]>(() =>
    file.sheets.map((s) => ({
      include: true,
      track: s.defaults.track,
      sourceId: sourceId(s.defaults.sourceLabel),
      contactedOn: null,
      touchType: s.defaults.touchType,
    }))
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [campaignName, setCampaignName] = useState(campaignFromFileName(file.fileName));
  const [addInviters, setAddInviters] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = saDate();

  const setSheet = (i: number, change: Partial<SheetChoice>) =>
    setSheets((all) => all.map((s, j) => (j === i ? { ...s, ...change } : s)));
  const toggleRow = (key: string) =>
    setExcluded((all) => {
      const next = new Set(all);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const counts = useMemo(() => {
    let rows = 0;
    let fresh = 0;
    let updates = 0;
    let merged = 0;
    let newPeople = 0;
    file.sheets.forEach((sheet, i) => {
      if (!sheets[i].include) return;
      for (const r of sheet.rows) {
        if (excluded.has(r.key)) continue;
        rows++;
        const m = matches[r.key];
        if (!m || m.status === "new") {
          fresh++;
          if (r.firstName) newPeople++;
        } else if (m.status === "repeat") merged++;
        else updates++;
      }
    });
    return { rows, fresh, updates, merged, newPeople };
  }, [file.sheets, sheets, excluded, matches]);

  const submit = () => {
    const choices: ImportChoices = {
      sheets,
      excluded: [...excluded],
      campaignName: file.kind === "outreach" ? campaignName : null,
      addInviters,
    };
    startTransition(async () => {
      const result = await commitImport(file, choices);
      if ("error" in result) setError(result.error);
      else onDone(result.summary);
    });
  };

  return (
    <div className="space-y-5">
      <div className="card space-y-2">
        <h2 className="text-lg font-semibold break-words">{file.fileName}</h2>
        {file.kind === "bni_visitors" && (
          <p className="text-sm text-ink-soft">
            BNI {file.chapter ?? "chapter"} meeting on {file.meetingDate ? formatDate(file.meetingDate) : "an unknown date"}.
            Each visitor gets a note of the visit and is linked to whoever invited them.
          </p>
        )}
        {preview.previouslyImported && (
          <p className="text-sm text-danger" role="status">
            You imported this exact file on {formatDate(preview.previouslyImported)}. Importing it again only adds what&apos;s
            missing.
          </p>
        )}
        {file.warnings.map((w) => (
          <p key={w} className="text-sm text-ink-soft">
            {w}
          </p>
        ))}
        {file.kind === "outreach" && (
          <div className="max-w-md">
            <label className="field-label" htmlFor="campaign">
              Campaign name
            </label>
            <input id="campaign" value={campaignName} maxLength={120} onChange={(e) => setCampaignName(e.target.value)} />
          </div>
        )}
      </div>

      {inviters.length > 0 && (
        <section className="card space-y-2">
          <h3 className="section-title">Invited by</h3>
          <ul className="space-y-1 text-sm">
            {inviters.map((inv) => (
              <li key={inv.name}>
                {inv.existing ? (
                  <span>
                    <span className="font-medium">{inv.name}</span>{" "}
                    <span className="text-ink-soft">is already a contact, so visitors are linked to them.</span>
                  </span>
                ) : (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={addInviters[inv.name] !== false}
                      onChange={(e) => setAddInviters((all) => ({ ...all, [inv.name]: e.target.checked }))}
                    />
                    <span>
                      Add <span className="font-medium">{inv.name}</span> as a contact (BNI member) and link their visitors
                    </span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {file.sheets.map((sheet, i) => {
        const choice = sheets[i];
        const ignored = sheet.columns.filter((c) => !c.field).map((c) => c.header);
        const used = sheet.columns.filter((c) => c.field);
        return (
          <section key={sheet.name} className="card space-y-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={choice.include} onChange={(e) => setSheet(i, { include: e.target.checked })} />
              <span className="font-semibold">
                {file.sheets.length > 1 ? `Tab “${sheet.name}”` : sheet.name}
              </span>
              <span className="badge">
                {sheet.rows.length} {sheet.rows.length === 1 ? "row" : "rows"}
              </span>
            </label>

            {choice.include && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor={`track-${i}`}>
                      Import them as
                    </label>
                    <select
                      id={`track-${i}`}
                      value={choice.track}
                      onChange={(e) => setSheet(i, { track: e.target.value as SheetChoice["track"] })}
                    >
                      {TRACKS.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {choice.track !== "none" && (
                    <div>
                      <label className="field-label" htmlFor={`source-${i}`}>
                        Source
                      </label>
                      <select
                        id={`source-${i}`}
                        value={choice.sourceId ?? ""}
                        onChange={(e) => setSheet(i, { sourceId: e.target.value || null })}
                      >
                        <option value="">Not sure</option>
                        {sources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {file.kind !== "bni_visitors" &&
                  (sheet.hasContactDates ? (
                    <p className="text-sm text-ink-soft">
                      Contact dates and replies come from the sheet. Rows without a date are imported as not contacted yet.
                    </p>
                  ) : (
                    <fieldset className="space-y-2">
                      <legend className="field-label">Were these contacted?</legend>
                      <div className="chips">
                        <label className="chip">
                          <input
                            type="radio"
                            name={`contacted-${i}`}
                            checked={choice.contactedOn === null}
                            onChange={() => setSheet(i, { contactedOn: null })}
                          />
                          Not yet
                        </label>
                        <label className="chip">
                          <input
                            type="radio"
                            name={`contacted-${i}`}
                            checked={choice.contactedOn !== null}
                            onChange={() => setSheet(i, { contactedOn: addDays(today, -1) })}
                          />
                          Yes, already sent
                        </label>
                      </div>
                      {choice.contactedOn !== null && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="field-label" htmlFor={`sent-on-${i}`}>
                              Sent on
                            </label>
                            <input
                              id={`sent-on-${i}`}
                              type="date"
                              max={today}
                              value={choice.contactedOn}
                              onChange={(e) => setSheet(i, { contactedOn: e.target.value || null })}
                            />
                          </div>
                          <div>
                            <label className="field-label" htmlFor={`via-${i}`}>
                              Sent by
                            </label>
                            <select
                              id={`via-${i}`}
                              value={choice.touchType}
                              onChange={(e) => setSheet(i, { touchType: e.target.value as TouchType })}
                            >
                              {TOUCH_TYPES.filter((t) => t.key !== "meeting" && t.key !== "note").map((t) => (
                                <option key={t.key} value={t.key}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <p className="text-sm text-ink-soft sm:col-span-2">
                            {`Each person gets a touch (“${labelOf(TOUCH_TYPES, choice.touchType)} sent”, no reply yet) and moves to Contacted.`}
                          </p>
                        </div>
                      )}
                    </fieldset>
                  ))}

                <p className="text-xs text-ink-soft">
                  Using: {used.map((c) => `${c.header} → ${FIELD_LABEL[c.field!] ?? c.field}`).join(" · ")}
                  {ignored.length > 0 && <> · Not imported: {ignored.join(", ")}</>}
                </p>

                <ul className="divide-y divide-line rounded-lg border border-line">
                  {sheet.rows.map((r) => (
                    <li key={r.key} className="flex items-start gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        aria-label={`Import ${rowName(r)}`}
                        checked={!excluded.has(r.key)}
                        onChange={() => toggleRow(r.key)}
                      />
                      <div className={`min-w-0 flex-1 ${excluded.has(r.key) ? "opacity-50" : ""}`}>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{rowName(r)}</span>
                          {r.firstName && r.organisation && <span className="text-sm text-ink-soft">{r.organisation}</span>}
                          <MatchBadge match={matches[r.key]} />
                        </p>
                        <p className="break-all text-xs text-ink-soft">
                          {[r.email, r.phone, r.invitedBy && `invited by ${r.invitedBy}`].filter(Boolean).join(" · ") ||
                            "No email or number"}
                        </p>
                      </div>
                      <span className="text-xs text-ink-soft">row {r.row}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        );
      })}

      <section className="card space-y-3">
        <p className="text-sm">
          <span className="font-semibold">{counts.rows} rows selected:</span> {counts.fresh} new, {counts.updates} added to
          existing contacts, {counts.merged} repeats merged. Existing details are never overwritten; only blanks are filled.
        </p>
        {counts.newPeople > 0 && (
          <p className="text-sm text-ink-soft">
            <span className="font-medium text-ink">POPIA:</span>{" "}
            {`${counts.newPeople} new ${counts.newPeople === 1 ? "person has" : "people have"} no recorded marketing consent.`}{" "}
            You can contact them one-to-one, but don&apos;t add them to bulk marketing until they&apos;ve agreed (section
            69). Record consent on each person&apos;s page.
          </p>
        )}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-accent" disabled={pending || counts.rows === 0} onClick={submit}>
            {pending ? "Importing…" : `Import ${counts.rows} rows`}
          </button>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>
            Choose another file
          </button>
        </div>
      </section>
    </div>
  );
}
