import { describe, it, expect } from "vitest";
import { matchRows, type ExistingPerson } from "@/lib/import/match";
import { cleanDate, outcomeFrom, phoneKey, splitName } from "@/lib/import/normalize";
import { parseImportFile } from "@/lib/import/parse";
import { buildPlan, invitersOf, type ImportChoices } from "@/lib/import/plan";
import { contactListWorkbook, outreachWorkbook, VISITOR_FILE_NAME, visitorWorkbook } from "./support/fake-workbooks";

const PAT: ExistingPerson = {
  id: "00000000-0000-4000-8000-000000000100",
  first_name: "Pat",
  last_name: "Existing",
  email: null,
  phone: "082 000 0100",
  organisation: null,
};

describe("cleaning cells", () => {
  it("reads the date formats in the real sheets", () => {
    expect(cleanDate("2026/10/21")).toBe("2026-10-21");
    expect(cleanDate("21/10/2026")).toBe("2026-10-21");
    expect(cleanDate(44824)).toBe("2022-09-20");
    expect(cleanDate("31/02/2026")).toBeNull();
  });

  it("compares phone numbers however they were typed", () => {
    expect(phoneKey("082 000 0100")).toBe(phoneKey("+27 82 000 0100"));
    expect(phoneKey("0820000100")).toBe("27820000100");
  });

  it("splits names and reads replies", () => {
    expect(splitName("Ann  Example")).toEqual({ firstName: "Ann", lastName: "Example" });
    expect(outcomeFrom("N")).toBe("no_reply");
    expect(outcomeFrom("Yes, keen")).toBe("replied");
    expect(outcomeFrom("Booked a 1-2-1")).toBe("meeting_booked");
    expect(outcomeFrom("Not interested")).toBe("not_interested");
  });
});

describe("BNI visitor sheet", () => {
  const file = parseImportFile("bni_visitors", VISITOR_FILE_NAME, visitorWorkbook());

  it("finds the meeting date, chapter and visitors", () => {
    expect(file.meetingDate).toBe("2026-10-21");
    expect(file.chapter).toBe("The Cradle");
    expect(file.sheets).toHaveLength(1);
    const [vusi, ann, sol] = file.sheets[0].rows;
    expect(vusi).toMatchObject({
      firstName: "Vusi", lastName: "Sample", organisation: "Sample Signs", email: "vusi@example.test",
      phone: "082 000 0201", invitedBy: "Ivy Inviter", visitorType: "Visitor", contactedOn: "2026-10-21",
    });
    expect(ann).toMatchObject({ firstName: "Ann", lastName: "Example", phone: "0820000202" });
    expect(sol.invitedBy).toBe("Sol Self");
    expect(file.sheets[0].rows).toHaveLength(3);
  });

  it("links visitors to their inviter, adding inviters who aren't contacts yet", () => {
    const inviters = invitersOf(file, [PAT]);
    expect(inviters).toEqual([
      { name: "Ivy Inviter", existing: null },
      { name: "Pat Existing", existing: { id: PAT.id, name: "Pat Existing" } },
    ]);

    const choices: ImportChoices = {
      sheets: [{ include: true, track: "client", sourceId: "src-visitor", contactedOn: null, touchType: "note" }],
      excluded: [],
      campaignName: null,
      addInviters: {},
    };
    const plan = buildPlan(file, choices, matchRows(file.sheets[0].rows, [PAT], []), [PAT]);
    expect(plan.rows[0]).toMatchObject({
      key: "inviter:ivy inviter",
      person: { first_name: "Ivy", last_name: "Inviter", bni_chapter: "The Cradle", is_bni_member: true },
    });
    const [vusi, ann, sol] = plan.rows.slice(1);
    expect(vusi.journey).toEqual({ track: "client", stage: "prospect", source_id: "src-visitor", referred_by_key: "inviter:ivy inviter" });
    expect(vusi.touch?.summary).toBe("Visited BNI The Cradle on 21 Oct 2026, invited by Ivy Inviter, visitor");
    expect(vusi.touch?.occurred_at).toBe("2026-10-21T07:00:00+02:00");
    expect(ann.journey?.referred_by_person_id).toBe(PAT.id);
    expect(sol.journey?.referred_by_key).toBeUndefined();
    expect(sol.journey?.referred_by_person_id).toBeUndefined();
  });

  it("leaves out inviters you untick", () => {
    const plan = buildPlan(
      file,
      {
        sheets: [{ include: true, track: "client", sourceId: null, contactedOn: null, touchType: "note" }],
        excluded: [],
        campaignName: null,
        addInviters: { "Ivy Inviter": false, "Pat Existing": false },
      },
      matchRows(file.sheets[0].rows, [], []),
      []
    );
    expect(plan.rows.some((r) => r.key.startsWith("inviter:"))).toBe(false);
    expect(plan.rows[0].journey?.referred_by_key).toBeUndefined();
  });
});

describe("outreach campaign", () => {
  const file = parseImportFile("outreach", "BNI_Accountant_Outreach.xlsx", outreachWorkbook());

  it("reads each tab with its own channel and source, and skips the instructions tab", () => {
    expect(file.sheets.map((s) => [s.name, s.defaults.touchType, s.defaults.sourceLabel, s.defaults.track, s.hasContactDates])).toEqual([
      ["Emails", "email", "BNI Connect search", "partner", false],
      ["BNI Connect", "bni_message", "BNI Connect search", "partner", false],
      ["Follow-ups to gala contacts", "email", "Event", "partner", false],
    ]);
    expect(file.warnings).toEqual(["Tab “How to send” has no recognisable columns, so it was skipped."]);
    const ignored = file.sheets[0].columns.filter((c) => !c.field).map((c) => c.header);
    expect(ignored).toEqual(expect.arrayContaining(["Greeting name", "Email body", "WhatsApp text", "Gauteng"]));
    expect(file.sheets[0].rows[1]).toMatchObject({ firstName: "Bea", channel: "whatsapp", bniChapter: "Kaisen", isBniMember: true, industry: "Bookkeeping" });
    expect(file.sheets[2].rows[0]).toMatchObject({ firstName: "Gail", lastName: "Gala", responded: "Yes, keen" });
  });

  it("merges a person who appears on two tabs", () => {
    const rows = file.sheets.flatMap((s) => s.rows);
    const matches = matchRows(rows, [], []);
    const alexConnect = file.sheets[1].rows[0];
    expect(matches[alexConnect.key]).toEqual({ status: "repeat", of: file.sheets[0].rows[0].key, row: 2 });
  });

  it("only creates touches for what you say was sent", () => {
    const rows = file.sheets.flatMap((s) => s.rows);
    const plan = buildPlan(
      file,
      {
        sheets: [
          { include: true, track: "partner", sourceId: "src-connect", contactedOn: "2026-10-06", touchType: "email" },
          { include: true, track: "partner", sourceId: "src-connect", contactedOn: null, touchType: "bni_message" },
          { include: false, track: "partner", sourceId: "src-event", contactedOn: null, touchType: "email" },
        ],
        excluded: [file.sheets[0].rows[2].key],
        campaignName: "Accountant partners Oct 2026",
        addInviters: {},
      },
      matchRows(rows, [], []),
      []
    );
    expect(plan.meta.campaign).toEqual({ name: "Accountant partners Oct 2026", track: "partner" });
    expect(plan.rows.map((r) => r.key)).toEqual(["0:2", "0:3", "1:2", "1:3"]);
    const [alex, bea, alexAgain, dee] = plan.rows;
    expect(alex.touch).toEqual({
      type: "email", direction: "out", outcome: "no_reply", occurred_at: "2026-10-06T09:00:00+02:00", summary: "Helping your clients",
    });
    expect(alex.journey?.stage).toBe("contacted");
    expect(bea.touch?.type).toBe("whatsapp");
    expect(alexAgain).toMatchObject({ same_as: "0:2", journey: { stage: "prospect" } });
    expect(alexAgain.touch).toBeUndefined();
    expect(dee.touch).toBeUndefined();
    expect(dee.person?.bni_chapter).toBe("Table Bay");
  });
});

describe("contact list", () => {
  const file = parseImportFile("contact_list", "Potential client list.xlsx", contactListWorkbook());

  it("finds the header below a title row and reads both tabs", () => {
    expect(file.sheets.map((s) => s.name)).toEqual(["Businesses", "Financial Advisors"]);
    const [pam, signShop] = file.sheets[0].rows;
    expect(pam).toMatchObject({
      firstName: "Pam", lastName: "Pool", role: "Owner", organisation: "Pam's Pools", industry: "Pool maintanance",
      contactedOn: "2022-09-20", responded: "N", notes: "Met at the expo",
    });
    expect(signShop).toMatchObject({ firstName: null, organisation: "Sign Shop", email: "info@signshop.example.test" });
    expect(file.sheets[0].hasContactDates).toBe(true);
    expect(file.sheets[1].rows[0]).toMatchObject({ firstName: "Bob", organisation: "Broker Brokers", role: "Broker" });
  });

  it("imports a business-only row as a business, dated from the sheet", () => {
    const plan = buildPlan(
      file,
      {
        sheets: [
          { include: true, track: "client", sourceId: "src-own", contactedOn: null, touchType: "email" },
          { include: true, track: "client", sourceId: "src-own", contactedOn: null, touchType: "email" },
        ],
        excluded: [],
        campaignName: null,
        addInviters: {},
      },
      matchRows(file.sheets.flatMap((s) => s.rows), [], [{ id: "org-1", name: "SIGN SHOP (Pty) Ltd" }]),
      []
    );
    const signShop = plan.rows[1];
    expect(signShop.person).toBeUndefined();
    expect(signShop.organisation_id).toBe("org-1");
    expect(signShop.touch).toMatchObject({ type: "email", outcome: "no_reply", occurred_at: "2022-09-20T09:00:00+02:00" });
    expect(plan.rows[2].touch).toBeUndefined();
  });
});

describe("matching existing contacts", () => {
  const people: ExistingPerson[] = [
    { id: "a", first_name: "Alex", last_name: "Ledger", email: "alex@example.test", phone: null, organisation: null },
    { id: "b", first_name: "Bea", last_name: "Books", email: null, phone: "+27 82 000 0302", organisation: null },
    { id: "c", first_name: "Cy", last_name: "Audit", email: null, phone: null, organisation: "Audit Ltd" },
    { id: "d1", first_name: "Sam", last_name: "Same", email: null, phone: null, organisation: null },
    { id: "d2", first_name: "Sam", last_name: "Same", email: null, phone: null, organisation: null },
  ];
  const row = (over: object) => ({
    key: "k", row: 2, firstName: null, lastName: null, email: null, phone: null, role: null, organisation: null, city: null,
    industry: null, bniChapter: null, isBniMember: false, invitedBy: null, visitorType: null, contactedOn: null,
    responded: null, channel: null, subject: null, notes: null, ...over,
  });

  it("matches on email, then number, then name and business", () => {
    const m = matchRows(
      [
        row({ key: "1", firstName: "Alexander", email: "ALEX@example.test" }),
        row({ key: "2", firstName: "B", phone: "082 000 0302" }),
        row({ key: "3", firstName: "Cy", lastName: "Audit", organisation: "Audit (Pty) Ltd" }),
        row({ key: "4", firstName: "Sam", lastName: "Same" }),
        row({ key: "5", firstName: "Cy", lastName: "Audit", organisation: "Other Firm" }),
      ],
      people,
      []
    );
    expect(m["1"]).toMatchObject({ status: "existing", personId: "a", reason: "email" });
    expect(m["2"]).toMatchObject({ status: "existing", personId: "b", reason: "number" });
    expect(m["3"]).toMatchObject({ status: "existing", personId: "c", reason: "name" });
    expect(m["4"]).toEqual({ status: "new" });
    expect(m["5"]).toEqual({ status: "new" });
  });
});
