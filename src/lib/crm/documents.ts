// Uploads go through a server action, and Vercel refuses request bodies over
// about 4.5 MB, so files are capped at 4 MB. Bigger material goes in as a link.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const LINK_LIFETIME_DAYS = 365;

// Mirrors the bucket's allowed_mime_types in 20261023160000_documents_library_templates.sql.
const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** For the file input's accept attribute. */
export const ACCEPTED_FILES = Object.keys(CONTENT_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

/** Client documents; library items are always marketing. */
export const DOCUMENT_KINDS = [
  { key: "proposal", label: "Proposal" },
  { key: "contract", label: "Contract" },
  { key: "report", label: "Report" },
  { key: "other", label: "Other" },
] as const;

/** By extension, since browsers don't always report a type for Office files. */
export function contentTypeFor(fileName: string): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return CONTENT_TYPES[ext] ?? null;
}

/** A storage-safe file name that keeps the extension. */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}

/** {workspace}/{document}/v{n}/{file}: storage access rules key off the first folder. */
export function storagePath(workspaceId: string, documentId: string, version: number, fileName: string): string {
  return `${workspaceId}/${documentId}/v${version}/${safeFileName(fileName)}`;
}

export function fileSize(bytes: number | null): string {
  if (bytes === null) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
