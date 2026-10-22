import { createHash } from "node:crypto";
import {
  channelFrom,
  cleanDate,
  cleanEmail,
  cleanPhone,
  cleanText,
  splitName,
  type Cell,
} from "./normalize";
import { readWorkbook, type Sheet } from "./sheets";
import type { ColumnMapping, ImportKind, ParsedFile, ParsedRow, ParsedSheet } from "./types";

type Field =
  | "firstName"
  | "lastName"
  | "fullName"
  | "organisation"
  | "email"
  | "phone"
  | "role"
  | "city"
  | "industry"
  | "chapter"
  | "notes"
  | "contactedOn"
  | "responded"
  | "result"
  | "channel"
  | "subject"
  | "invitedBy"
  | "visitorType";

// Header text (lower-cased, punctuation removed) → field. Anything else is ignored.
const HEADERS: [RegExp, Field][] = [
  [/^first ?names?$/, "firstName"],
  [/^(surname|last ?name|family name)$/, "lastName"],
  [/^(name|names|full ?name|name (and )?surname|contact( person)?|contact name)$/, "fullName"],
  [/^(company|company name|business|business name|brokerage|brokerage name|organi[sz]ation|firm|practice)$/, "organisation"],
  [/^(e ?mail|e ?mail address|email address)$/, "email"],
  [/^(cell|cellphone|cell no|mobile|phone|phone number|tel|tel no|telephone|number|contact number)$/, "phone"],
  [/^(position|role|title|job title)$/, "role"],
  [/^(city|town|area|suburb)$/, "city"],
  [/^(type|industry|category|subcategory|sector)$/, "industry"],
  [/^(bni )?chapter$/, "chapter"],
  [/^notes?$/, "notes"],
  [/^(contacted|sent date|date contacted|date sent)$/, "contactedOn"],
  [/^(responded|reply|replied)$/, "responded"],
  [/^result$/, "result"],
  [/^channel$/, "channel"],
  [/^subject$/, "subject"],
  [/^invited by$/, "invitedBy"],
  [/^(visitor ?guest|visitor or guest|type of visitor)$/, "visitorType"],
];

function headerKey(cell: Cell): string {
  return String(cell ?? "")
    .toLowerCase()
    .replace(/[ \s]+/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldFor(cell: Cell): Field | null {
  const key = headerKey(cell);
  return HEADERS.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}

/** The header row: the one in the first few rows that names the most known columns. */
function findHeader(rows: Cell[][]): { index: number; fields: (Field | null)[] } | null {
  let best: { index: number; fields: (Field | null)[]; score: number } | null = null;
  rows.slice(0, 8).forEach((row, index) => {
    const fields = row.map(fieldFor);
    const score = fields.filter(Boolean).length;
    if (score >= 2 && (!best || score > best.score)) best = { index, fields, score };
  });
  return best;
}

function emptyRow(key: string, row: number): ParsedRow {
  return {
    key,
    row,
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    role: null,
    organisation: null,
    city: null,
    industry: null,
    bniChapter: null,
    isBniMember: false,
    invitedBy: null,
    visitorType: null,
    contactedOn: null,
    responded: null,
    channel: null,
    subject: null,
    notes: null,
  };
}

function rowsFrom(sheet: Sheet, sheetIndex: number, header: { index: number; fields: (Field | null)[] }) {
  const parsed: ParsedRow[] = [];
  sheet.rows.slice(header.index + 1).forEach((cells, i) => {
    const value = (field: Field) => {
      const col = header.fields.indexOf(field);
      return col === -1 ? null : cells[col];
    };
    const row = emptyRow(`${sheetIndex}:${header.index + i + 2}`, header.index + i + 2);
    const full = splitName(cleanText(value("fullName")));
    row.firstName = cleanText(value("firstName"), 80) ?? full.firstName;
    row.lastName = cleanText(value("lastName"), 80) ?? (cleanText(value("firstName")) ? null : full.lastName);
    row.email = cleanEmail(value("email"));
    row.phone = cleanPhone(value("phone"));
    row.role = cleanText(value("role"), 120);
    row.organisation = cleanText(value("organisation"), 160);
    row.city = cleanText(value("city"), 120);
    row.industry = cleanText(value("industry"), 120);
    row.bniChapter = cleanText(value("chapter"), 80);
    row.isBniMember = !!row.bniChapter;
    row.invitedBy = cleanText(value("invitedBy"), 160);
    row.visitorType = cleanText(value("visitorType"), 40);
    row.contactedOn = cleanDate(value("contactedOn"));
    row.responded = cleanText(value("responded"), 200) ?? cleanText(value("result"), 200);
    row.channel = channelFrom(cleanText(value("channel")));
    row.subject = cleanText(value("subject"), 300);
    row.notes = cleanText(value("notes"), 2000);
    // A row needs someone or some business to be worth importing.
    if (row.firstName || row.organisation) parsed.push(row);
  });
  return parsed;
}

function mapping(sheet: Sheet, header: { index: number; fields: (Field | null)[] }): ColumnMapping[] {
  return sheet.rows[header.index]
    .map((cell, i) => ({ header: cleanText(cell, 80) ?? "", field: header.fields[i] }))
    .filter((c) => c.header);
}

/** "BNI The Cradle - Weekly Sheets -21 Oct 2026.xlsx" → "The Cradle". */
function chapterFrom(fileName: string, sheets: Sheet[]): string | null {
  const fromName = fileName.match(/BNI\s+(.+?)\s+-/i)?.[1];
  if (fromName) return cleanText(fromName, 80);
  for (const sheet of sheets) {
    for (const row of sheet.rows.slice(0, 4)) {
      for (const cell of row) {
        const m = cleanText(cell)?.match(/^BNI\s+(.+)$/i);
        if (m) return m[1].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
  }
  return null;
}

function meetingDateFrom(rows: Cell[][]): string | null {
  for (const row of rows.slice(0, 6)) {
    const at = row.findIndex((cell) => /^date\b/i.test(cleanText(cell) ?? ""));
    if (at === -1) continue;
    for (const cell of row.slice(at + 1)) {
      const date = cleanDate(cell);
      if (date) return date;
    }
  }
  return null;
}

function parseVisitors(fileName: string, sheets: Sheet[], warnings: string[]): Pick<ParsedFile, "sheets" | "meetingDate" | "chapter"> {
  const index = sheets.findIndex((s) => /visitor/i.test(s.name));
  if (index === -1) throw new ImportError("This doesn't look like a BNI weekly sheet: there's no Visitors tab.");
  const sheet = sheets[index];
  const header = findHeader(sheet.rows);
  if (!header) throw new ImportError("Couldn't find the visitor columns (name, company, email…).");
  const meetingDate = meetingDateFrom(sheet.rows);
  if (!meetingDate) warnings.push("No meeting date found on the sheet; the visit will be dated today.");
  const chapter = chapterFrom(fileName, sheets);
  const rows = rowsFrom(sheet, index, header).map((r) => ({ ...r, contactedOn: meetingDate }));
  return {
    meetingDate,
    chapter,
    sheets: [
      {
        name: sheet.name,
        columns: mapping(sheet, header),
        rows,
        hasContactDates: true,
        defaults: { track: "client", sourceLabel: "BNI chapter visitor", touchType: "note" },
      },
    ],
  };
}

function parseLists(kind: ImportKind, sheets: Sheet[], warnings: string[]): ParsedSheet[] {
  const parsed: ParsedSheet[] = [];
  sheets.forEach((sheet, index) => {
    const header = findHeader(sheet.rows);
    if (!header) {
      if (sheet.rows.length) warnings.push(`Tab “${sheet.name}” has no recognisable columns, so it was skipped.`);
      return;
    }
    const rows = rowsFrom(sheet, index, header);
    if (!rows.length) return;
    const fields = header.fields;
    const sheetChannel = channelFrom(sheet.name);
    const fromBniConnect = /bni connect/i.test(sheet.name) || fields.includes("chapter");
    const fromEvent = /gala|event|expo|conference/i.test(sheet.name);
    const hasContactDates = rows.some((r) => r.contactedOn);
    parsed.push({
      name: sheet.name,
      columns: mapping(sheet, header),
      rows,
      hasContactDates,
      defaults: {
        track: kind === "outreach" ? "partner" : "client",
        sourceLabel: fromEvent
          ? "Event"
          : fromBniConnect
            ? "BNI Connect search"
            : kind === "outreach" || hasContactDates
              ? "Cold outreach"
              : "Own network",
        touchType: sheetChannel ?? "email",
      },
    });
  });
  if (!parsed.length) throw new ImportError("No tab in this file has columns the import recognises (name, company, email…).");
  return parsed;
}

export class ImportError extends Error {}

export function parseImportFile(kind: ImportKind, fileName: string, data: ArrayBuffer | Buffer): ParsedFile {
  const buffer = Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  const hash = createHash("sha256").update(buffer).digest("hex");
  let sheets: Sheet[];
  try {
    sheets = readWorkbook(buffer);
  } catch {
    throw new ImportError("Couldn't read this file. Save it as .xlsx or .csv and try again.");
  }
  const warnings: string[] = [];
  if (kind === "bni_visitors") {
    return { kind, fileName, hash, warnings, ...parseVisitors(fileName, sheets, warnings) };
  }
  return { kind, fileName, hash, warnings, meetingDate: null, chapter: null, sheets: parseLists(kind, sheets, warnings) };
}
