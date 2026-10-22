import { formatDate, saDate } from "@/lib/crm/dates";
import type { TouchType } from "@/lib/crm/labels";
import { advanceFor } from "@/lib/crm/stages";
import { findPersonByName, type ExistingPerson, type Match } from "./match";
import { nameKey, outcomeFrom } from "./normalize";
import type { ImportKind, ParsedFile, ParsedRow } from "./types";

export type SheetChoice = {
  include: boolean;
  track: "client" | "partner" | "none";
  sourceId: string | null;
  /** For sheets without their own dates: when the outreach went out (null = not yet). */
  contactedOn: string | null;
  touchType: TouchType;
};

export type ImportChoices = {
  sheets: SheetChoice[];
  excluded: string[];
  campaignName: string | null;
  /** Inviters not yet in the CRM: name → add them as a contact. */
  addInviters: Record<string, boolean>;
};

type PlanTouch = { type: TouchType; direction: "out" | null; outcome: string | null; occurred_at: string; summary: string | null };

export type PlanRow = {
  key: string;
  same_as?: string;
  person_id?: string;
  organisation_id?: string;
  person?: {
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    role_title: string | null;
    bni_chapter: string | null;
    is_bni_member: boolean;
    notes: string | null;
  };
  organisation?: { name: string; city: string | null; industry: string | null };
  journey?: {
    track: "client" | "partner";
    stage: string;
    source_id: string | null;
    referred_by_person_id?: string;
    referred_by_key?: string;
  };
  touch?: PlanTouch;
};

export type Plan = {
  meta: { kind: ImportKind; file_name: string; file_hash: string; campaign: { name: string; track: "client" | "partner" } | null };
  rows: PlanRow[];
};

/** BNI chapters meet at 07:00; other outreach is dated mid-morning. */
function at(date: string, time: string): string {
  return `${date}T${time}:00+02:00`;
}

export type Inviter = { name: string; existing: { id: string; name: string } | null };

/** Distinct "invited by" names on a visitor sheet, matched to existing people. */
export function invitersOf(file: ParsedFile, people: ExistingPerson[]): Inviter[] {
  const names = new Map<string, string>();
  for (const sheet of file.sheets) {
    for (const r of sheet.rows) {
      if (r.invitedBy && nameKey(r.invitedBy) !== nameKey(r.firstName, r.lastName)) {
        names.set(nameKey(r.invitedBy), r.invitedBy);
      }
    }
  }
  return [...names.values()].map((name) => {
    const hit = findPersonByName(name, people);
    return { name, existing: hit ? { id: hit.id, name: [hit.first_name, hit.last_name].filter(Boolean).join(" ") } : null };
  });
}

function touchFor(file: ParsedFile, row: ParsedRow, choice: SheetChoice, campaignName: string | null): PlanTouch | undefined {
  if (file.kind === "bni_visitors") {
    const date = file.meetingDate ?? saDate();
    const parts = [`Visited BNI${file.chapter ? ` ${file.chapter}` : ""} on ${formatDate(date)}`];
    if (row.invitedBy) parts.push(`invited by ${row.invitedBy}`);
    if (row.visitorType) parts.push(row.visitorType.toLowerCase());
    return { type: "note", direction: null, outcome: null, occurred_at: at(date, "07:00"), summary: parts.join(", ") };
  }
  const date = row.contactedOn ?? choice.contactedOn;
  if (!date) return undefined;
  return {
    type: row.channel ?? choice.touchType,
    direction: "out",
    outcome: outcomeFrom(row.responded),
    occurred_at: at(date, "09:00"),
    summary: row.subject ?? campaignName,
  };
}

/** Turns the parsed file plus the choices made on screen into rows for public.import_contacts. */
export function buildPlan(
  file: ParsedFile,
  choices: ImportChoices,
  matches: Record<string, Match>,
  people: ExistingPerson[]
): Plan {
  const excluded = new Set(choices.excluded);
  const rows: PlanRow[] = [];
  const campaignName = file.kind === "outreach" ? choices.campaignName?.trim() || null : null;
  const firstTrack = choices.sheets.find(
    (s): s is SheetChoice & { track: "client" | "partner" } => s.include && s.track !== "none"
  )?.track;

  // Inviters first, so visitors can point at them.
  const inviterRef = new Map<string, { personId?: string; key?: string }>();
  if (file.kind === "bni_visitors") {
    for (const inviter of invitersOf(file, people)) {
      const k = nameKey(inviter.name);
      if (inviter.existing) {
        inviterRef.set(k, { personId: inviter.existing.id });
      } else if (choices.addInviters[inviter.name] !== false) {
        const [first, ...rest] = inviter.name.split(" ");
        const key = `inviter:${k}`;
        rows.push({
          key,
          person: {
            first_name: first,
            last_name: rest.join(" ") || null,
            email: null,
            phone: null,
            role_title: null,
            bni_chapter: file.chapter,
            is_bni_member: true,
            notes: null,
          },
        });
        inviterRef.set(k, { key });
      }
    }
  }

  // Imported keys, so a repeat only points at a row that is actually imported.
  const imported = new Set<string>();

  file.sheets.forEach((sheet, i) => {
    const choice = choices.sheets[i];
    if (!choice?.include) return;
    for (const row of sheet.rows) {
      if (excluded.has(row.key)) continue;
      const match = matches[row.key] ?? { status: "new" };
      const touch = touchFor(file, row, choice, campaignName);
      const plan: PlanRow = { key: row.key };

      if (match.status === "repeat" && imported.has(match.of)) {
        plan.same_as = match.of;
      } else {
        if (match.status === "existing") plan.person_id = match.personId;
        if (match.status === "existing_business") plan.organisation_id = match.organisationId;
        if (row.firstName) {
          plan.person = {
            first_name: row.firstName,
            last_name: row.lastName,
            email: row.email,
            phone: row.phone,
            role_title: row.role,
            bni_chapter: row.bniChapter,
            is_bni_member: row.isBniMember,
            notes: row.notes,
          };
        }
        if (row.organisation && match.status !== "existing_business") {
          plan.organisation = { name: row.organisation, city: row.city, industry: row.industry };
        }
      }

      if (choice.track !== "none") {
        const stage = touch ? (advanceFor(choice.track, "prospect", touch) ?? "prospect") : "prospect";
        plan.journey = { track: choice.track, stage, source_id: choice.sourceId };
        const inviter = row.invitedBy ? inviterRef.get(nameKey(row.invitedBy)) : undefined;
        if (inviter?.personId) plan.journey.referred_by_person_id = inviter.personId;
        if (inviter?.key) plan.journey.referred_by_key = inviter.key;
      }
      if (touch) plan.touch = touch;

      rows.push(plan);
      imported.add(row.key);
    }
  });

  return {
    meta: {
      kind: file.kind,
      file_name: file.fileName,
      file_hash: file.hash,
      campaign: campaignName && firstTrack ? { name: campaignName, track: firstTrack } : null,
    },
    rows,
  };
}
