// Phase 1a tables, proven against the real migrations: what a workspace member
// can do, what the database refuses (closing without a reason, crossing
// workspaces, skipping two-factor), and that stage history writes itself.
import { describe, it, expect, beforeAll } from "vitest";
import { migratedDb, type Who } from "./support/pgdb";

type Db = Awaited<ReturnType<typeof migratedDb>>;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER: Who = { id: id(1), email: "owner@konzult.test" };
const OUTSIDER: Who = { id: id(2), email: "outsider@elsewhere.test" };

const CRM_TABLES = [
  "sources",
  "exit_reasons",
  "organisations",
  "people",
  "journeys",
  "journey_stage_history",
  "interactions",
  "interaction_people",
  "tasks",
];

describe("CRM tables", () => {
  let db: Db;
  let personId: string;
  let journeyId: string;
  let reasonId: string;

  beforeAll(async () => {
    db = await migratedDb();
    await db.addUser(OWNER);
    await db.addUser(OUTSIDER);
    // The outsider gets a workspace of their own, so cross-workspace checks are real.
    await db.admin(
      `with ws as (insert into public.workspaces (name) values ('Elsewhere') returning id)
       insert into public.workspace_members (workspace_id, user_id, role) select id, $1, 'owner' from ws`,
      [OUTSIDER.id]
    );

    const org = await db.as<{ id: string }>(
      OWNER, "aal2", `insert into public.organisations (name, city) values ('Demo Bakery', 'Krugersdorp') returning id`
    );
    const person = await db.as<{ id: string }>(
      OWNER, "aal2",
      `insert into public.people (first_name, last_name, organisation_id) values ('Thandi', 'Example', $1) returning id`,
      [org.rows[0].id]
    );
    personId = person.rows[0].id;
    const journey = await db.as<{ id: string }>(
      OWNER, "aal2", `insert into public.journeys (track, person_id) values ('client', $1) returning id`, [personId]
    );
    journeyId = journey.rows[0].id;
    const reason = await db.admin(`select id from public.exit_reasons where label = 'Bad timing'`);
    reasonId = reason.rows[0].id as string;
  });

  it("gives a new workspace the default sources and exit reasons", async () => {
    const counts = await db.as<{ sources: number; reasons: number; ours: number }>(
      OWNER, "aal2",
      `select (select count(*)::int from public.sources) as sources,
              (select count(*)::int from public.exit_reasons) as reasons,
              (select count(*)::int from public.exit_reasons where side = 'ours') as ours`
    );
    expect(counts.rows[0]).toEqual({ sources: 10, reasons: 12, ours: 6 });
  });

  it("fills workspace and audit columns without the app passing them", async () => {
    const row = await db.admin(`select workspace_id, created_by, stage, status from public.journeys where id = $1`, [journeyId]);
    const ws = await db.admin(`select workspace_id from public.workspace_members where user_id = $1`, [OWNER.id]);
    expect(row.rows[0]).toMatchObject({
      workspace_id: ws.rows[0].workspace_id,
      created_by: OWNER.id,
      stage: "prospect",
      status: "open",
    });
  });

  it("writes stage history for every stage and status change", async () => {
    await db.as(OWNER, "aal2", `update public.journeys set stage = 'contacted' where id = $1`, [journeyId]);
    await db.as(OWNER, "aal2", `update public.journeys set chance_pct = 40 where id = $1`, [journeyId]);
    const history = await db.as<{ from_stage: string | null; to_stage: string }>(
      OWNER, "aal2",
      `select from_stage, to_stage from public.journey_stage_history where journey_id = $1 order by changed_at, to_stage desc`,
      [journeyId]
    );
    expect(history.rows).toEqual([
      { from_stage: null, to_stage: "prospect" },
      { from_stage: "prospect", to_stage: "contacted" },
    ]);
  });

  it("refuses to close a journey without a reason, or park it without a date", async () => {
    await expect(
      db.as(OWNER, "aal2", `update public.journeys set status = 'lost' where id = $1`, [journeyId])
    ).rejects.toThrow(/journeys_closed_has_reason/);
    await expect(
      db.as(OWNER, "aal2",
        `update public.journeys set status = 'parked', exit_reason_id = $2, exit_stage = stage, closed_at = now()
         where id = $1`, [journeyId, reasonId])
    ).rejects.toThrow(/journeys_parked_has_date/);
  });

  it("parks with a reason and date, then reopens cleanly", async () => {
    await db.as(OWNER, "aal2",
      `update public.journeys set status = 'parked', exit_reason_id = $2, exit_stage = stage,
         closed_at = now(), parked_until = date '2027-01-15' where id = $1`, [journeyId, reasonId]);
    await expect(
      db.as(OWNER, "aal2", `update public.journeys set status = 'open' where id = $1`, [journeyId])
    ).rejects.toThrow(/journeys_open_is_clean/);
    await db.as(OWNER, "aal2",
      `update public.journeys set status = 'open', exit_reason_id = null, exit_stage = null,
         closed_at = null, parked_until = null where id = $1`, [journeyId]);
    const statuses = await db.admin(
      `select to_status from public.journey_stage_history where journey_id = $1 order by changed_at`, [journeyId]
    );
    expect(statuses.rows.map((r) => r.to_status)).toEqual(["open", "open", "parked", "open"]);
  });

  it("keeps stages within their track", async () => {
    await expect(
      db.as(OWNER, "aal2", `update public.journeys set stage = 'one_to_one' where id = $1`, [journeyId])
    ).rejects.toThrow(/journeys_stage_fits_track/);
  });

  it("logs a touch against a person and shows it as the journey's last touch", async () => {
    const touch = await db.as<{ id: string }>(
      OWNER, "aal2",
      `insert into public.interactions (type, direction, outcome, journey_id, occurred_at)
       values ('whatsapp', 'out', 'replied', $1, timestamptz '2026-10-20 09:00+02') returning id`,
      [journeyId]
    );
    await db.as(OWNER, "aal2",
      `insert into public.interaction_people (interaction_id, person_id) values ($1, $2)`,
      [touch.rows[0].id, personId]);
    const overview = await db.as<{ display_name: string; organisation_name: string; last_touch_at: Date }>(
      OWNER, "aal2",
      `select display_name, organisation_name, last_touch_at from public.journey_overview where id = $1`,
      [journeyId]
    );
    expect(overview.rows[0].display_name).toBe("Thandi Example");
    expect(overview.rows[0].organisation_name).toBe("Demo Bakery");
    expect(new Date(overview.rows[0].last_touch_at).toISOString()).toBe("2026-10-20T07:00:00.000Z");
  });

  it("refuses a message without a direction", async () => {
    await expect(
      db.as(OWNER, "aal2", `insert into public.interactions (type) values ('email')`)
    ).rejects.toThrow(/interactions_direction_fits_type/);
  });

  it("lets the owner complete and delete tasks, but not delete people", async () => {
    const task = await db.as<{ id: string }>(
      OWNER, "aal2",
      `insert into public.tasks (title, due_on, person_id) values ('Send the one-pager', date '2026-10-23', $1) returning id`,
      [personId]
    );
    await db.as(OWNER, "aal2",
      `update public.tasks set status = 'done', completed_at = now() where id = $1`, [task.rows[0].id]);
    await db.as(OWNER, "aal2", `delete from public.tasks where id = $1`, [task.rows[0].id]);
    await expect(
      db.as(OWNER, "aal2", `delete from public.people where id = $1`, [personId])
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps stage history read-only for the app", async () => {
    await expect(
      db.as(OWNER, "aal2",
        `insert into public.journey_stage_history (workspace_id, journey_id, to_stage, to_status)
         select workspace_id, id, 'client', 'open' from public.journeys where id = $1`, [journeyId])
    ).rejects.toThrow(/permission denied/);
  });

  it("never moves a row to another workspace", async () => {
    const other = await db.admin(`select workspace_id from public.workspace_members where user_id = $1`, [OUTSIDER.id]);
    await db.as(OWNER, "aal2", `update public.people set workspace_id = $2 where id = $1`, [personId, other.rows[0].workspace_id]);
    const row = await db.admin(`select workspace_id from public.people where id = $1`, [personId]);
    expect(row.rows[0].workspace_id).not.toBe(other.rows[0].workspace_id);
  });

  it("hides everything from a session that hasn't passed two-factor", async () => {
    for (const t of [...CRM_TABLES, "journey_overview"]) {
      const r = await db.as(OWNER, "aal1", `select * from public.${t}`);
      expect({ t, rows: r.rows.length }).toEqual({ t, rows: 0 });
    }
    await expect(
      db.as(OWNER, "aal1", `insert into public.people (first_name) values ('Sneaky')`)
    ).rejects.toThrow(/row-level security/);
  });

  it("hides the workspace's records from another workspace", async () => {
    for (const t of [...CRM_TABLES, "journey_overview"]) {
      const r = await db.as(OUTSIDER, "aal2", `select * from public.${t} where workspace_id <> private.my_workspace_id()`);
      expect({ t, rows: r.rows.length }).toEqual({ t, rows: 0 });
    }
  });

  it("refuses writes into, or links to, another workspace's records", async () => {
    const konzult = await db.admin(`select workspace_id from public.workspace_members where user_id = $1`, [OWNER.id]);
    await expect(
      db.as(OUTSIDER, "aal2", `insert into public.people (workspace_id, first_name) values ($1, 'Intruder')`,
        [konzult.rows[0].workspace_id])
    ).rejects.toThrow(/row-level security/);
    // Their own workspace, but pointing at Konzult's person: the composite key refuses it.
    await expect(
      db.as(OUTSIDER, "aal2", `insert into public.journeys (track, person_id) values ('client', $1)`, [personId])
    ).rejects.toThrow(/foreign key/);
  });

  it("refuses logged-out visitors everywhere", async () => {
    for (const t of [...CRM_TABLES, "journey_overview"]) {
      await expect(db.anon(`select * from public.${t}`)).rejects.toThrow(/permission denied/);
    }
  });
});
