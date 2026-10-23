"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { keysOf, TOUCH_TYPES } from "@/lib/crm/labels";
import { sourceOptions } from "@/lib/crm/lookups";
import { matchRows, type ExistingOrganisation, type ExistingPerson, type Match } from "@/lib/import/match";
import { EMAIL } from "@/lib/import/normalize";
import { ImportError, parseImportFile } from "@/lib/import/parse";
import { buildPlan, invitersOf, type ImportChoices, type Inviter } from "@/lib/import/plan";
import { IMPORT_KINDS, type ParsedFile } from "@/lib/import/types";
import { fetchAll } from "@/lib/supabase/fetch-all";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

type Supabase = Awaited<ReturnType<typeof requireMfaSession>>["supabase"];

export type ImportPreview = {
  file: ParsedFile;
  matches: Record<string, Match>;
  inviters: Inviter[];
  sources: { id: string; label: string }[];
  previouslyImported: string | null;
};

export type PreviewState = { error: string } | { preview: ImportPreview } | null;

export type ImportSummary = {
  people_created: number;
  people_updated: number;
  organisations_created: number;
  journeys_created: number;
  touches_created: number;
};

async function existing(supabase: Supabase): Promise<{ people: ExistingPerson[]; organisations: ExistingOrganisation[] }> {
  const [{ data: people, error: peopleError }, { data: organisations, error: orgError }] = await Promise.all([
    fetchAll((from, to) =>
      supabase.from("people").select("id, first_name, last_name, email, phone, organisations(name)").order("id").range(from, to)
    ),
    fetchAll((from, to) => supabase.from("organisations").select("id, name").order("id").range(from, to)),
  ]);
  if (peopleError || orgError) throw new Error("couldn't load existing contacts");
  return {
    people: (people ?? []).map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      phone: p.phone,
      organisation: p.organisations?.name ?? null,
    })),
    organisations: organisations ?? [],
  };
}

export async function previewImport(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const { supabase } = await requireMfaSession();
  const kind = z.enum(IMPORT_KINDS).safeParse(formData.get("kind"));
  const upload = formData.get("file");
  if (!kind.success) return { error: "Choose what kind of file this is." };
  if (!(upload instanceof File) || upload.size === 0) return { error: "Choose a file to import." };
  if (upload.size > MAX_BYTES) return { error: "That file is over 5 MB. Split it into smaller files." };
  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(upload.name)) return { error: "Import an Excel (.xlsx, .xls) or .csv file." };

  let file: ParsedFile;
  try {
    file = parseImportFile(kind.data, upload.name.slice(0, 255), await upload.arrayBuffer());
  } catch (e) {
    if (e instanceof ImportError) return { error: e.message };
    console.error("import parse failed", e);
    return { error: "Couldn't read this file. Save it as .xlsx and try again." };
  }
  if (file.sheets.reduce((n, s) => n + s.rows.length, 0) > MAX_ROWS) {
    return { error: `That's more than ${MAX_ROWS} rows. Split the file and import it in parts.` };
  }

  try {
    const [{ people, organisations }, sources, { data: previous }] = await Promise.all([
      existing(supabase),
      sourceOptions(supabase),
      supabase.from("imports").select("created_at").eq("file_hash", file.hash).order("created_at", { ascending: false }).limit(1),
    ]);
    return {
      preview: {
        file,
        matches: matchRows(file.sheets.flatMap((s) => s.rows), people, organisations),
        inviters: file.kind === "bni_visitors" ? invitersOf(file, people) : [],
        sources,
        previouslyImported: previous?.[0]?.created_at ?? null,
      },
    };
  } catch (e) {
    console.error("import preview failed", e);
    return { error: "Couldn't compare the file with your contacts. Try again." };
  }
}

// The preview travels through the browser, so it's validated again here.
const text = (max: number) => z.string().max(max).nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const touchType = z.enum(keysOf(TOUCH_TYPES));

const rowSchema = z.object({
  key: z.string().min(1).max(40),
  row: z.number().int().min(0).max(1_000_000),
  firstName: text(80),
  lastName: text(80),
  email: z.string().max(254).regex(EMAIL).nullable(),
  phone: text(40),
  role: text(120),
  organisation: text(160),
  city: text(120),
  industry: text(120),
  bniChapter: text(80),
  isBniMember: z.boolean(),
  invitedBy: text(160),
  visitorType: text(40),
  contactedOn: isoDate.nullable(),
  responded: text(200),
  channel: touchType.nullable(),
  subject: text(300),
  notes: text(2000),
});

const fileSchema = z.object({
  kind: z.enum(IMPORT_KINDS),
  fileName: z.string().min(1).max(255),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  meetingDate: isoDate.nullable(),
  chapter: text(80),
  warnings: z.array(z.string().max(300)).max(50),
  sheets: z
    .array(
      z.object({
        name: z.string().max(120),
        columns: z.array(z.object({ header: z.string().max(80), field: z.string().max(40).nullable() })).max(200),
        rows: z.array(rowSchema).max(MAX_ROWS),
        hasContactDates: z.boolean(),
        defaults: z.object({
          track: z.enum(["client", "partner"]),
          sourceLabel: z.string().max(80),
          touchType,
        }),
      })
    )
    .min(1)
    .max(50),
});

const choicesSchema = z.object({
  sheets: z
    .array(
      z.object({
        include: z.boolean(),
        track: z.enum(["client", "partner", "none"]),
        sourceId: z.uuid().nullable(),
        contactedOn: isoDate.nullable(),
        touchType,
      })
    )
    .max(50),
  excluded: z.array(z.string().max(40)).max(MAX_ROWS),
  campaignName: z.string().max(120).nullable(),
  addInviters: z.record(z.string().max(160), z.boolean()),
});

export async function commitImport(
  file: ParsedFile,
  choices: ImportChoices
): Promise<{ error: string } | { summary: ImportSummary }> {
  const { supabase } = await requireMfaSession();
  const parsedFile = fileSchema.safeParse(file);
  const parsedChoices = choicesSchema.safeParse(choices);
  if (!parsedFile.success || !parsedChoices.success || parsedChoices.data.sheets.length !== parsedFile.data.sheets.length) {
    return { error: "The import didn't match its preview. Upload the file again." };
  }
  if (parsedFile.data.sheets.reduce((n, s) => n + s.rows.length, 0) > MAX_ROWS) {
    return { error: `That's more than ${MAX_ROWS} rows.` };
  }
  if (parsedFile.data.kind === "outreach" && !parsedChoices.data.campaignName?.trim()) {
    return { error: "Give the campaign a name." };
  }

  try {
    // Matched afresh, in case contacts changed since the preview.
    const { people, organisations } = await existing(supabase);
    const fresh = parsedFile.data as ParsedFile;
    const matches = matchRows(fresh.sheets.flatMap((s) => s.rows), people, organisations);
    const plan = buildPlan(fresh, parsedChoices.data, matches, people);
    if (!plan.rows.length) return { error: "Nothing is selected to import." };

    const { data, error } = await supabase.rpc("import_contacts", { p_import: plan.meta, p_rows: plan.rows });
    if (error || !data) {
      console.error("import failed", error);
      return { error: "The import didn't go through, so nothing was saved. Try again." };
    }
    revalidatePath("/", "layout");
    return { summary: data as ImportSummary };
  } catch (e) {
    console.error("import failed", e);
    return { error: "The import didn't go through, so nothing was saved. Try again." };
  }
}
