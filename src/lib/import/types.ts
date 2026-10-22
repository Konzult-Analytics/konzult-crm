import type { TouchType } from "@/lib/crm/labels";

export const IMPORT_KINDS = ["bni_visitors", "outreach", "contact_list"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  bni_visitors: "BNI visitor sheet",
  outreach: "Outreach campaign",
  contact_list: "Contact list",
};

/** One spreadsheet row, cleaned. Dates are YYYY-MM-DD; everything is plain JSON. */
export type ParsedRow = {
  key: string;
  row: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  organisation: string | null;
  city: string | null;
  industry: string | null;
  bniChapter: string | null;
  isBniMember: boolean;
  invitedBy: string | null;
  visitorType: string | null;
  contactedOn: string | null;
  responded: string | null;
  channel: TouchType | null;
  subject: string | null;
  notes: string | null;
};

export type ColumnMapping = { header: string; field: string | null };

export type ParsedSheet = {
  name: string;
  columns: ColumnMapping[];
  rows: ParsedRow[];
  /** Rows carry their own contact dates, so there's nothing to ask about sending. */
  hasContactDates: boolean;
  defaults: { track: "client" | "partner"; sourceLabel: string; touchType: TouchType };
};

export type ParsedFile = {
  kind: ImportKind;
  fileName: string;
  hash: string;
  /** BNI visitor sheets: the meeting date and chapter. */
  meetingDate: string | null;
  chapter: string | null;
  sheets: ParsedSheet[];
  warnings: string[];
};
