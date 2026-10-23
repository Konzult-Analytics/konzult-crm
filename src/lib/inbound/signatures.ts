import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Connection keys: 48 URL-safe characters (36 random bytes). Framer needs at least 32. */
export const KEY_PATTERN = /^[A-Za-z0-9_-]{48}$/;
export const MAX_BODY_BYTES = 64 * 1024;

export function newConnectionKey(): string {
  return randomBytes(36).toString("base64url");
}

/** What the database stores instead of the key (matches sha256 in the migration). */
export function keyFingerprint(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Cal.com: HMAC-SHA256 of the raw body, in `x-cal-signature-256`. Its docs don't
 * name the encoding, so hex (the usual) and base64 are both accepted.
 */
export function calSignatureValid(key: string, body: Uint8Array, header: string | null): boolean {
  if (!header) return false;
  const mac = createHmac("sha256", key).update(body).digest();
  const given = header.trim();
  return same(given.toLowerCase(), mac.toString("hex")) || same(given, mac.toString("base64"));
}

/**
 * Framer (and the future Vercel website, which signs the same way):
 * `sha256=` + hex HMAC-SHA256 of the raw body followed by the submission ID.
 */
export function websiteSignatureValid(
  key: string,
  body: Uint8Array,
  submissionId: string | null,
  header: string | null
): boolean {
  if (!header || !submissionId) return false;
  const mac = createHmac("sha256", key).update(body).update(submissionId).digest("hex");
  return same(header.trim().toLowerCase(), `sha256=${mac}`);
}
