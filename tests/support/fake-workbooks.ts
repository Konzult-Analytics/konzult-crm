// Fake workbooks laid out like Zander's real files (same tabs, headers and
// quirks), filled with invented people. Used by the import tests.
import * as XLSX from "xlsx";

type Row = (string | number | null)[];

function book(sheets: Record<string, Row[]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export const VISITOR_FILE_NAME = "BNI The Cradle - Weekly Sheets -21 Oct 2026.xlsx";

export function visitorWorkbook(): Buffer {
  return book({
    "Visitors & Guests": [
      ["VISITORS & GUESTS", null, null, null, null, null, null, "ATTENDANCE"],
      [null, "DATE :", "2026/10/21"],
      [null, "NAME & SURNAME", "COMPANY", "Tel no", "Email", "INVITED BY", "Visitor/Guest", "SIGNATURE"],
      [1, "Vusi Sample", "Sample Signs", "082 000 0201", "Vusi@Example.test", "Ivy Inviter", "Visitor"],
      [2, "Ann  Example", null, 820000202, "ann@example.test", "Pat Existing", "Guest"],
      [3, "Sol Self", "Solo Co", null, null, "Sol Self", null],
      [4],
      [5],
    ],
    Payments: [["BNI THE CRADLE"], ["DATE", "2026/10/21"], ["PAYMENTS RECEIVED"], ["NAME & SURNAME", "INVOICE MEMBER", "CARD"]],
    Members: [["DATE:", "2026/10/21"], ["BNI THE CRADLE", "ATTENDANCE MEMBERS"], [" NAME ", "SURNAME", "TIME", " SIGNATURE "], [1, "Ivy", "Inviter"]],
  });
}

export function outreachWorkbook(): Buffer {
  const emailHeader = [
    "Send batch", "Greeting name", "First name", "Surname", "Company", "City", "Gauteng", "Chapter", "Subcategory",
    "Email", "Cell", "Channel", "Subject", "Email body", "WhatsApp text", "Follow-up (day 7)", "Check first",
    "Sent date", "WhatsApped", "Reply", "Result",
  ];
  return book({
    Emails: [
      emailHeader,
      [1, "Alex", "Alex", "Ledger", "Ledger & Co", "Pretoria", "Yes", "Elite", "Accounting services", "alex@example.test", "0820000301", "Email", "Helping your clients", "Hi Alex…"],
      [1, "Bea", "Bea", "Books", "Books CC", "Randburg", "Yes", "Kaisen", "Bookkeeping", "bea@example.test", null, "WhatsApp only", "Helping your clients", "Hi Bea…"],
      [2, "Cy", "Cy", "Audit", "Audit (Pty) Ltd", "Durban", "No", "Coastal", "Auditor", "cy@example.test", "0820000303", "Email", "Helping your clients", "Hi Cy…"],
    ],
    "BNI Connect": [
      ["First name", "Surname", "Company", "City", "Chapter", "Subcategory", "BNI Connect message", "Sent date", "Reply", "Result"],
      ["Alex", "Ledger", "Ledger and Co", "Pretoria", "Elite", "Accounting services", "Hi Alex, this is…"],
      ["Dee", "Debit", "Debit Payroll", "Cape Town", "Table Bay", "Payroll", "Hi Dee, this is…"],
    ],
    "Follow-ups to gala contacts": [
      ["Name", "Company", "Chapter", "Email", "Cell", "Gala email sent", "Subject", "Email body", "Sent date", "Reply", "Result"],
      ["Gail Gala", "Gala Tax", "The A Team", "gail@example.test", "082 000 0304", "Yes", "Following up", "Hi Gail…", null, "Yes, keen", null],
    ],
    "How to send": [["How to send these"], ["1. Attach the overview", "Export the proposal"]],
  });
}

export function contactListWorkbook(): Buffer {
  const header = ["Date added", "Name", "Position", "Business Name", "email address", "Number", "Type", "Contacted", "Responded", "Notes"];
  return book({
    "Email list (consent)": [],
    Businesses: [
      ["Potential clients"],
      header,
      [44824, "Pam Pool", "Owner", "Pam's Pools", "pam@example.test", "0820000401", "Pool maintanance", 44824, "N", "Met at the expo"],
      [44824, null, null, "Sign Shop", "info@signshop.example.test", "0820000402", "Printing and signage", 44824, "N", null],
    ],
    "Financial Advisors": [
      ["Brokers"],
      ["Date added", "Name", "Position", "Brokerage name", "email address", "Number", "Type", "Contacted", "Responded", "Notes"],
      [44900, "Bob Broker", "Broker", "Broker Brokers", "bob@example.test", "0820000403"],
    ],
  });
}
