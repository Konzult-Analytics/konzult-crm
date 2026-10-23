"use client";

import { useActionState, useState } from "react";
import { addDocument, newVersion } from "@/app/(app)/documents/actions";
import { FileOrLink } from "@/components/Documents";
import SubmitButton from "@/components/SubmitButton";
import { ACCEPTED_FILES } from "@/lib/crm/documents";
import { MERGE_FIELDS, PURPOSES } from "@/lib/crm/messages";
import { saveTemplate } from "./actions";

export function AddLibraryItem() {
  const [state, action] = useActionState(addDocument, null);
  const [asLink, setAsLink] = useState(false);
  return (
    <form action={action} className="space-y-3 text-sm">
      <input type="hidden" name="is_library" value="on" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="lib-title">
            Title
          </label>
          <input id="lib-title" name="title" required maxLength={120} placeholder="e.g. The Map explained" />
        </div>
        <div>
          <label className="field-label" htmlFor="lib-service">
            Service
          </label>
          <input id="lib-service" name="service" maxLength={80} list="lib-services" placeholder="e.g. The Map" />
          <datalist id="lib-services">
            <option value="The Map" />
            <option value="The Next Stage" />
            <option value="Fractional Financial Engineer" />
          </datalist>
        </div>
        <div>
          <label className="field-label" htmlFor="lib-audience">
            Audience
          </label>
          <input id="lib-audience" name="audience" maxLength={80} list="lib-audiences" placeholder="e.g. Business owners" />
          <datalist id="lib-audiences">
            <option value="Business owners" />
            <option value="Accountants" />
            <option value="BNI members" />
          </datalist>
        </div>
      </div>
      <FileOrLink id="library" asLink={asLink} setAsLink={setAsLink} />
      {state?.error && (
        <p className="text-danger" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pending="Uploading…">Add to the library</SubmitButton>
    </form>
  );
}

export function NewVersionForm({ documentId }: { documentId: string }) {
  const [state, action] = useActionState(newVersion.bind(null, documentId), null);
  return (
    <form action={action} className="mt-2 space-y-2 text-sm">
      <label className="field-label" htmlFor={`version-${documentId}`}>
        New version (links already sent keep the version they got)
      </label>
      <input id={`version-${documentId}`} name="file" type="file" required accept={ACCEPTED_FILES} />
      {state?.error && (
        <p className="text-danger" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pending="Uploading…" className="btn btn-ghost btn-sm">
        Upload new version
      </SubmitButton>
    </form>
  );
}

export type TemplateValues = {
  id: string;
  name: string;
  purpose: string;
  subject: string | null;
  body: string;
  active: boolean;
};

export function TemplateForm({ template }: { template: TemplateValues | null }) {
  const [state, action] = useActionState(saveTemplate.bind(null, template?.id ?? null), null);
  const key = template?.id ?? "new";
  return (
    <form action={action} className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor={`t-name-${key}`}>
            Name
          </label>
          <input id={`t-name-${key}`} name="name" required maxLength={80} defaultValue={template?.name ?? ""} />
        </div>
        <div>
          <label className="field-label" htmlFor={`t-purpose-${key}`}>
            Kind of message (POPIA)
          </label>
          <select id={`t-purpose-${key}`} name="purpose" defaultValue={template?.purpose ?? "personal"}>
            {PURPOSES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor={`t-subject-${key}`}>
          Email subject
        </label>
        <input id={`t-subject-${key}`} name="subject" maxLength={200} defaultValue={template?.subject ?? ""} />
      </div>
      <div>
        <label className="field-label" htmlFor={`t-body-${key}`}>
          Message
        </label>
        <textarea id={`t-body-${key}`} name="body" required rows={8} maxLength={4000} defaultValue={template?.body ?? ""} />
        <p className="mt-1 text-xs text-ink-soft">
          Fills in: {MERGE_FIELDS.join(", ")}. Marketing messages get the opt-out line added automatically.
        </p>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={template?.active ?? true} />
        In use
      </label>
      {state?.error && (
        <p className="text-danger" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pending="Saving…" className="btn btn-ghost">
        {template ? "Save template" : "Add template"}
      </SubmitButton>
    </form>
  );
}
