"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { IMPORT_KIND_LABEL, type ImportKind } from "@/lib/import/types";
import { previewImport, type ImportSummary } from "./actions";
import ImportPreview from "./ImportPreview";

const KINDS: { key: ImportKind; hint: string }[] = [
  { key: "bni_visitors", hint: "The Cradle weekly sheet. Visitors are linked to whoever invited them." },
  { key: "outreach", hint: "A list you've messaged, like the accountant outreach. Grouped as one campaign." },
  { key: "contact_list", hint: "Any list of people or businesses, like your potential-client list." },
];

export default function ImportFlow() {
  const [state, action] = useActionState(previewImport, null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  // Starting over hides the last result (until the next upload replaces it)
  // and remounts the form so the file input clears.
  const [hidden, setHidden] = useState<typeof state>(null);
  const [round, setRound] = useState(0);
  const current = state !== hidden ? state : null;
  const startOver = () => {
    setHidden(state);
    setRound((r) => r + 1);
  };

  if (summary) {
    const lines = [
      [summary.people_created, "new people"],
      [summary.people_updated, "matched to existing contacts (only blanks filled)"],
      [summary.organisations_created, "new businesses"],
      [summary.journeys_created, "journeys started"],
      [summary.touches_created, "touches logged"],
    ] as const;
    return (
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Import done</h2>
        <ul className="space-y-1 text-sm">
          {lines.map(([n, label]) => (
            <li key={label}>
              <span className="font-semibold">{n}</span> {label}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link href="/people" className="btn btn-accent">
            View people
          </Link>
          <Link href="/pipeline" className="btn btn-ghost">
            Open the pipeline
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSummary(null);
              startOver();
            }}
          >
            Import another file
          </button>
        </div>
      </div>
    );
  }

  if (current && "preview" in current) {
    return <ImportPreview key={round} preview={current.preview} onDone={setSummary} onCancel={startOver} />;
  }

  return (
    <form key={round} action={action} className="space-y-5">
      <fieldset className="card space-y-3">
        <legend className="section-title px-1">What are you importing?</legend>
        {KINDS.map((k, i) => (
          <label key={k.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-accent">
            <input type="radio" name="kind" value={k.key} defaultChecked={i === 0} className="mt-1" />
            <span>
              <span className="block font-medium">{IMPORT_KIND_LABEL[k.key]}</span>
              <span className="block text-sm text-ink-soft">{k.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="card space-y-3">
        <label className="field-label" htmlFor="file">
          File (.xlsx, .xls or .csv, up to 5 MB)
        </label>
        <input id="file" name="file" type="file" accept=".xlsx,.xlsm,.xls,.csv" required />
        <p className="text-xs text-ink-soft">Nothing is saved until you check the preview and press Import.</p>
        {current && "error" in current && (
          <p className="text-sm text-danger" role="alert">
            {current.error}
          </p>
        )}
        <SubmitButton pending="Reading the file…">Preview import</SubmitButton>
      </div>
    </form>
  );
}
