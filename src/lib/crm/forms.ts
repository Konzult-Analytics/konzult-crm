import { z } from "zod";

export type FormState = { error: string } | null;

/** Form text fields as a plain object; missing fields stay undefined. */
export function fields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const optionalEmail = z
  .union([z.literal(""), z.email().max(254)])
  .optional()
  .transform((v) => (v ? v.trim().toLowerCase() : null));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const requiredDate = isoDate;

export const optionalDate = z
  .union([z.literal(""), isoDate])
  .optional()
  .transform((v) => v || null);

export const optionalUuid = z
  .union([z.literal(""), z.uuid()])
  .optional()
  .transform((v) => v || null);

export function optionalEnum<T extends [string, ...string[]]>(values: T) {
  return z
    .union([z.literal(""), z.enum(values)])
    .optional()
    .transform((v) => (v ? (v as T[number]) : null));
}

export const checkbox = z
  .literal("on")
  .optional()
  .transform((v) => v === "on");
