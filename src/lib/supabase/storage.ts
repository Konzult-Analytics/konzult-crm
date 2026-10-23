import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_UPLOAD_BYTES, contentTypeFor, safeFileName, storagePath } from "@/lib/crm/documents";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

export const BUCKET = "documents";

export async function myWorkspaceId(supabase: Client): Promise<string | null> {
  const { data } = await supabase.from("workspace_members").select("workspace_id").limit(1).maybeSingle();
  return data?.workspace_id ?? null;
}

export type StoredFile = { path: string; fileName: string; contentType: string; size: number };

/** Checks and uploads one file as the signed-in user (storage rules apply). */
export async function storeFile(
  supabase: Client,
  documentId: string,
  version: number,
  file: File
): Promise<StoredFile | { error: string }> {
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Files can be up to 4 MB. Add bigger material as a link." };
  const contentType = contentTypeFor(file.name);
  if (!contentType) return { error: "Use a PDF, Word, Excel, PowerPoint or image file." };

  const workspaceId = await myWorkspaceId(supabase);
  if (!workspaceId) return { error: "Couldn't find your workspace." };

  const path = storagePath(workspaceId, documentId, version, file.name);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) {
    console.error("upload failed", error);
    return { error: "The upload didn't go through. Try again." };
  }
  return { path, fileName: safeFileName(file.name), contentType, size: file.size };
}

/** Removes an upload whose database row couldn't be saved. */
export async function discardFile(supabase: Client, path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("discard upload failed", error);
}

/** A signed URL for a stored file, valid for `seconds`. */
export async function signedFileUrl(supabase: Client, path: string, seconds: number): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) console.error("sign url failed", error);
  return data?.signedUrl ?? null;
}
