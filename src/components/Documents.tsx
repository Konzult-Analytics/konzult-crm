"use client";

import { useActionState, useState } from "react";
import { addDocument, archiveDocument } from "@/app/(app)/documents/actions";
import SubmitButton from "@/components/SubmitButton";
import { formatDate } from "@/lib/crm/dates";
import { ACCEPTED_FILES, DOCUMENT_KINDS, MAX_UPLOAD_BYTES, fileSize } from "@/lib/crm/documents";
import { labelOf } from "@/lib/crm/labels";

export type DocumentRow = {
  id: string;
  title: string;
  kind: string;
  file_name: string | null;
  size_bytes: number | null;
  url: string | null;
  version: number;
  created_at: string;
};

export default function Documents({
  documents,
  personId,
  organisationId,
  journeys = [],
}: {
  documents: DocumentRow[];
  personId?: string;
  organisationId?: string;
  journeys?: { id: string; label: string }[];
}) {
  return (
    <div className="card space-y-3">
      {documents.length === 0 ? (
        <p className="text-sm text-ink-soft">No documents yet: proposals, contracts and reports go here.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <a href={`/documents/${d.id}`} target="_blank" rel="noreferrer" className="link break-words font-medium">
                  {d.title}
                </a>{" "}
                <span className="badge">{labelOf(DOCUMENT_KINDS, d.kind) || "Other"}</span>
                <span className="block text-xs text-ink-soft">
                  {d.url ? "Link" : [d.file_name, fileSize(d.size_bytes)].filter(Boolean).join(" · ")}
                  {d.version > 1 && ` · version ${d.version}`} · added {formatDate(d.created_at)}
                </span>
              </span>
              <form action={archiveDocument}>
                <input type="hidden" name="document_id" value={d.id} />
                <button type="submit" className="btn btn-ghost btn-sm">
                  Archive
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <AddDocument personId={personId} organisationId={organisationId} journeys={journeys} />
    </div>
  );
}

function AddDocument({
  personId,
  organisationId,
  journeys,
}: {
  personId?: string;
  organisationId?: string;
  journeys: { id: string; label: string }[];
}) {
  const [state, action] = useActionState(addDocument, null);
  const [asLink, setAsLink] = useState(false);
  const key = personId ?? organisationId ?? "doc";
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Add a document</summary>
      <form action={action} className="mt-3 space-y-3">
        {personId && <input type="hidden" name="person_id" value={personId} />}
        {organisationId && <input type="hidden" name="organisation_id" value={organisationId} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor={`d-title-${key}`}>
              Title
            </label>
            <input id={`d-title-${key}`} name="title" required maxLength={120} placeholder="e.g. Engagement letter" />
          </div>
          <div>
            <label className="field-label" htmlFor={`d-kind-${key}`}>
              Kind
            </label>
            <select id={`d-kind-${key}`} name="kind" defaultValue="other">
              {DOCUMENT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          {journeys.length > 0 && (
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor={`d-journey-${key}`}>
                For which journey (optional)
              </label>
              <select id={`d-journey-${key}`} name="journey_id" defaultValue="">
                <option value="">Not a specific journey</option>
                {journeys.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <FileOrLink id={key} asLink={asLink} setAsLink={setAsLink} />
        {state?.error && (
          <p className="text-danger" role="alert">
            {state.error}
          </p>
        )}
        <SubmitButton pending="Uploading…" className="btn btn-ghost">
          Save document
        </SubmitButton>
      </form>
    </details>
  );
}

/** A 4 MB file, or a link for anything bigger (videos, podcasts, large decks). */
export function FileOrLink({
  id,
  asLink,
  setAsLink,
}: {
  id: string;
  asLink: boolean;
  setAsLink: (v: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <div className="chips">
        <label className="chip">
          <input type="radio" name={`source-${id}`} checked={!asLink} onChange={() => setAsLink(false)} />
          Upload a file
        </label>
        <label className="chip">
          <input type="radio" name={`source-${id}`} checked={asLink} onChange={() => setAsLink(true)} />
          Paste a link
        </label>
      </div>
      {asLink ? (
        <div>
          <label className="field-label" htmlFor={`d-url-${id}`}>
            Link (https://…)
          </label>
          <input id={`d-url-${id}`} name="url" type="url" required pattern="https://.*" maxLength={2000} />
        </div>
      ) : (
        <div>
          <label className="field-label" htmlFor={`d-file-${id}`}>
            File (PDF, Word, Excel, PowerPoint or image, up to 4 MB)
          </label>
          <input
            id={`d-file-${id}`}
            name="file"
            type="file"
            required
            accept={ACCEPTED_FILES}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.setCustomValidity(
                file && file.size > MAX_UPLOAD_BYTES ? "Files can be up to 4 MB. Add bigger material as a link." : ""
              );
              e.currentTarget.reportValidity();
            }}
          />
        </div>
      )}
    </fieldset>
  );
}
