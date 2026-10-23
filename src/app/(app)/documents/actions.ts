"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { DOCUMENT_KINDS } from "@/lib/crm/documents";
import { checkbox, fields, optionalText, optionalUuid, requiredText, type FormState } from "@/lib/crm/forms";
import { keysOf } from "@/lib/crm/labels";
import { discardFile, storeFile } from "@/lib/supabase/storage";

const linkUrl = z
  .union([z.literal(""), z.url({ protocol: /^https$/ }).max(2000)])
  .optional()
  .transform((v) => v || null);

const documentSchema = z.object({
  title: requiredText(120),
  kind: z.enum([...keysOf(DOCUMENT_KINDS), "marketing"]).default("other"),
  is_library: checkbox,
  person_id: optionalUuid,
  organisation_id: optionalUuid,
  journey_id: optionalUuid,
  service: optionalText(80),
  audience: optionalText(80),
  notes: optionalText(2000),
  url: linkUrl,
});

/** A client document or a library item: an uploaded file, or a link. */
export async function addDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  const parsed = documentSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "Give it a title. Links must start with https://." };
  const { url, is_library, ...rest } = parsed.data;
  const doc = is_library
    ? { ...rest, kind: "marketing", is_library, person_id: null, organisation_id: null, journey_id: null }
    : { ...rest, kind: rest.kind === "marketing" ? "other" : rest.kind, is_library, service: null, audience: null };
  if (!is_library && !doc.person_id && !doc.organisation_id && !doc.journey_id) {
    return { error: "That document needs a person or a business." };
  }

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile === !!url) return { error: "Choose a file or paste a link (one of the two)." };

  if (url) {
    const { error } = await supabase.from("documents").insert({ ...doc, url });
    if (error) {
      console.error("add link failed", error);
      return { error: "Couldn't save the link. Try again." };
    }
  } else {
    const id = randomUUID();
    const stored = await storeFile(supabase, id, 1, file as File);
    if ("error" in stored) return stored;
    const { error } = await supabase.from("documents").insert({
      ...doc,
      id,
      storage_path: stored.path,
      file_name: stored.fileName,
      content_type: stored.contentType,
      size_bytes: stored.size,
    });
    if (error) {
      console.error("add document failed", error);
      await discardFile(supabase, stored.path);
      return { error: "Couldn't save the document. Try again." };
    }
  }
  revalidatePath("/", "layout");
  return null;
}

/** A new version keeps the old file, so links already sent still open what was sent. */
export async function newVersion(documentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  if (!z.uuid().safeParse(documentId).success) return { error: "That document no longer exists." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the new file." };

  const { data: doc } = await supabase.from("documents").select("id, version, storage_path").eq("id", documentId).maybeSingle();
  if (!doc) return { error: "That document no longer exists." };
  if (!doc.storage_path) return { error: "This item is a link. Edit the link instead of uploading." };

  const version = doc.version + 1;
  const stored = await storeFile(supabase, doc.id, version, file);
  if ("error" in stored) return stored;
  const { error } = await supabase
    .from("documents")
    .update({ version, storage_path: stored.path, file_name: stored.fileName, content_type: stored.contentType, size_bytes: stored.size })
    .eq("id", doc.id)
    .eq("version", doc.version);
  if (error) {
    console.error("new version failed", error);
    await discardFile(supabase, stored.path);
    return { error: "Couldn't save the new version. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}

/** Hidden from lists and the send picker; links already sent keep working. */
export async function archiveDocument(formData: FormData): Promise<void> {
  const { supabase } = await requireMfaSession();
  const id = z.uuid().safeParse(formData.get("document_id"));
  if (!id.success) return;
  const { error } = await supabase.from("documents").update({ archived: true }).eq("id", id.data);
  if (error) console.error("archive document failed", error);
  revalidatePath("/", "layout");
}
