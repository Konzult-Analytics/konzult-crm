// public.import_contacts, proven against the real migrations: one transaction,
// existing people only gain missing details, links resolve inside the import,
// repeats add nothing, and row-level security and two-factor still apply.
import { describe, it, expect, beforeAll } from "vitest";
import { migratedDb, type Who } from "./support/pgdb";

type Db = Awaited<ReturnType<typeof migratedDb>>;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER: Who = { id: id(1), email: "owner@konzult.test" };
const OUTSIDER: Who = { id: id(2), email: "outsider@elsewhere.test" };
const HASH = (c: string) => c.repeat(64);

describe("import_contacts", { timeout: 30_000 }, () => {
  let db: Db;
  let visitorSource: string;
  let existingId: string;

  const run = (who: Who, aal: "aal1" | "aal2", meta: object, rows: object[]) =>
    db.as<{ result: Record<string, number | string | null> }>(
      who, aal, `select public.import_contacts($1::jsonb, $2::jsonb) as result`,
      [JSON.stringify(meta), JSON.stringify(rows)]
    );

  beforeAll(async () => {
    db = await migratedDb();
    await db.addUser(OWNER);
    await db.addUser(OUTSIDER);
    await db.admin(
      `with ws as (insert into public.workspaces (name) values ('Elsewhere') returning id)
       insert into public.workspace_members (workspace_id, user_id, role) select id, $1, 'owner' from ws`,
      [OUTSIDER.id]
    );
    visitorSource = (await db.admin(`select id from public.sources where label = 'BNI chapter visitor'`)).rows[0].id as string;
    const existing = await db.as<{ id: string }>(
      OWNER, "aal2",
      `insert into public.people (first_name, last_name, phone) values ('Pat', 'Existing', '082 000 0100') returning id`
    );
    existingId = existing.rows[0].id;
  });

  it("creates people, businesses, journeys, touches and introduced-by links in one go", async () => {
    const { rows } = await run(OWNER, "aal2", { kind: "bni_visitors", file_name: "week1.xlsx", file_hash: HASH("a") }, [
      { key: "inviter", person: { first_name: "Ivy", last_name: "Inviter", bni_chapter: "The Cradle", is_bni_member: true } },
      {
        key: "v1",
        person: { first_name: "Vic", last_name: "Visitor", email: "VIC@example.test", phone: "082 000 0101" },
        organisation: { name: "Visitor Co", city: "Krugersdorp" },
        journey: { track: "client", stage: "prospect", source_id: visitorSource, referred_by_key: "inviter" },
        touch: { type: "note", occurred_at: "2026-10-21T07:00:00+02:00", summary: "Visited The Cradle" },
      },
    ]);
    expect(rows[0].result).toMatchObject({
      people_created: 2, organisations_created: 1, journeys_created: 1, touches_created: 1,
    });
    const journey = await db.as(OWNER, "aal2",
      `select display_name, organisation_name, referred_by, source, stage from public.journey_overview where display_name = 'Vic Visitor'`);
    expect(journey.rows[0]).toEqual({
      display_name: "Vic Visitor", organisation_name: "Visitor Co", referred_by: "Ivy Inviter",
      source: "BNI chapter visitor", stage: "prospect",
    });
    const email = await db.admin(`select email from public.people where first_name = 'Vic'`);
    expect(email.rows[0].email).toBe("vic@example.test");
  });

  it("fills an existing person's blanks without overwriting, and moves a prospect forward", async () => {
    await run(OWNER, "aal2", { kind: "contact_list", file_name: "list.xlsx", file_hash: HASH("b") }, [
      {
        key: "e1", person_id: existingId,
        person: { first_name: "Pat", email: "pat@example.test", phone: "083 999 9999" },
        journey: { track: "client", stage: "prospect", source_id: visitorSource },
      },
    ]);
    const { rows } = await run(OWNER, "aal2", { kind: "outreach", file_name: "out.xlsx", file_hash: HASH("c"), campaign: { name: "Test campaign", track: "client" } }, [
      {
        key: "e1", person_id: existingId, person: { first_name: "Pat" },
        journey: { track: "client", stage: "contacted", source_id: visitorSource },
        touch: { type: "email", direction: "out", outcome: "no_reply", occurred_at: "2026-10-01T09:00:00+02:00", summary: "Intro email" },
      },
    ]);
    expect(rows[0].result).toMatchObject({ people_created: 0, people_updated: 1, journeys_created: 0, touches_created: 1 });
    const person = await db.admin(`select email, phone from public.people where id = $1`, [existingId]);
    expect(person.rows[0]).toEqual({ email: "pat@example.test", phone: "082 000 0100" });
    const journeys = await db.admin(`select stage from public.journeys where person_id = $1`, [existingId]);
    expect(journeys.rows).toEqual([{ stage: "contacted" }]);
    const touch = await db.admin(
      `select c.name from public.interactions i join public.campaigns c on c.id = i.campaign_id where i.summary = 'Intro email'`
    );
    expect(touch.rows).toEqual([{ name: "Test campaign" }]);
  });

  it("doesn't repeat touches when the same rows are imported again", async () => {
    const again = await run(OWNER, "aal2", { kind: "outreach", file_name: "out.xlsx", file_hash: HASH("c") }, [
      {
        key: "e1", person_id: existingId, person: { first_name: "Pat" },
        journey: { track: "client", stage: "contacted", source_id: visitorSource },
        touch: { type: "email", direction: "out", outcome: "no_reply", occurred_at: "2026-10-01T09:00:00+02:00", summary: "Intro email" },
      },
    ]);
    expect(again.rows[0].result).toMatchObject({ journeys_created: 0, touches_created: 0 });
  });

  it("merges a repeat row into the person it repeats", async () => {
    const { rows } = await run(OWNER, "aal2", { kind: "outreach", file_name: "two-tabs.xlsx", file_hash: HASH("9") }, [
      {
        key: "email:1", person: { first_name: "Riley", last_name: "Repeat", notes: "Prefers mornings" },
        journey: { track: "partner", stage: "contacted", source_id: visitorSource },
        touch: { type: "email", direction: "out", outcome: "no_reply", occurred_at: "2026-10-02T09:00:00+02:00", summary: "Email" },
      },
      {
        key: "connect:1", same_as: "email:1",
        journey: { track: "partner", stage: "contacted", source_id: visitorSource },
        touch: { type: "bni_message", direction: "out", outcome: "no_reply", occurred_at: "2026-10-03T09:00:00+02:00", summary: "Connect" },
      },
    ]);
    expect(rows[0].result).toMatchObject({ people_created: 1, journeys_created: 1, touches_created: 2 });
    const person = await db.admin(`select notes from public.people where first_name = 'Riley'`);
    expect(person.rows).toEqual([{ notes: "Prefers mornings" }]);
  });

  it("imports a business-only row as an organisation journey", async () => {
    const { rows } = await run(OWNER, "aal2", { kind: "contact_list", file_name: "biz.xlsx", file_hash: HASH("d") }, [
      {
        key: "b1",
        organisation: { name: "Nameless Pools", industry: "Pool maintenance" },
        journey: { track: "client", stage: "contacted", source_id: visitorSource },
        touch: { type: "email", direction: "out", outcome: "no_reply", occurred_at: "2022-09-21T09:00:00+02:00" },
      },
    ]);
    expect(rows[0].result).toMatchObject({ people_created: 0, organisations_created: 1, journeys_created: 1, touches_created: 1 });
    const j = await db.as(OWNER, "aal2",
      `select display_name, stage, last_touch_at is not null as touched from public.journey_overview where display_name = 'Nameless Pools'`);
    expect(j.rows[0]).toEqual({ display_name: "Nameless Pools", stage: "contacted", touched: true });
  });

  it("saves nothing when any row fails", async () => {
    const before = await db.admin(
      `select (select count(*)::int from public.people) as people, (select count(*)::int from public.imports) as imports`
    );
    await expect(
      run(OWNER, "aal2", { kind: "contact_list", file_name: "bad.xlsx", file_hash: HASH("e") }, [
        { key: "ok", person: { first_name: "Fine" } },
        { key: "bad", person: { first_name: "Broken" }, journey: { track: "client", stage: "one_to_one" } },
      ])
    ).rejects.toThrow(/journeys_stage_fits_track/);
    const after = await db.admin(
      `select (select count(*)::int from public.people) as people, (select count(*)::int from public.imports) as imports`
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("can't touch another workspace's people", async () => {
    await expect(
      run(OUTSIDER, "aal2", { kind: "contact_list", file_name: "x.xlsx", file_hash: HASH("f") }, [
        { key: "x", person_id: existingId, person: { first_name: "Pat", email: "stolen@example.test" } },
      ])
    ).rejects.toThrow(/not found/);
    const person = await db.admin(`select email from public.people where id = $1`, [existingId]);
    expect(person.rows[0].email).toBe("pat@example.test");
  });

  it("refuses sessions without two-factor and logged-out visitors", async () => {
    await expect(
      run(OWNER, "aal1", { kind: "contact_list", file_name: "x.xlsx", file_hash: HASH("1") }, [{ key: "a", person: { first_name: "A" } }])
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.anon(`select public.import_contacts('{}'::jsonb, '[]'::jsonb)`)
    ).rejects.toThrow(/permission denied/);
  });

  it("records each import with its counts", async () => {
    const log = await db.as(OWNER, "aal2",
      `select kind, file_name, people_created from public.imports where file_name = 'week1.xlsx'`);
    expect(log.rows).toEqual([{ kind: "bni_visitors", file_name: "week1.xlsx", people_created: 2 }]);
  });
});
