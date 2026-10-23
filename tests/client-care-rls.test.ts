// Phase 2a database rules: proposals move the journey, client sub-status and
// what Ended does to care tasks, the backfill for earlier clients, and access.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { migratedDb, type Who } from "./support/pgdb";

type Db = Awaited<ReturnType<typeof migratedDb>>;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER: Who = { id: id(1), email: "owner@konzult.test" };
const OUTSIDER: Who = { id: id(2), email: "outsider@elsewhere.test" };
const BACKFILL = readFileSync(
  path.join(__dirname, "../supabase/migrations/20261023130100_client_care_backfill.sql"),
  "utf-8"
);

describe("client care and proposals", { timeout: 30_000 }, () => {
  let db: Db;
  let journeyId: string;

  const journey = async (jid: string) =>
    (
      await db.admin(`select stage, status, value_estimate::float as value, client_status from public.journeys where id = $1`, [
        jid,
      ])
    ).rows[0];
  const openCare = async (jid: string) =>
    (
      await db.admin(
        `select kind from public.tasks where journey_id = $1 and status = 'open' and origin = 'auto' order by kind`,
        [jid]
      )
    ).rows.map((r) => r.kind);
  const newJourney = async (track: string, stage: string) => {
    const person = await db.as<{ id: string }>(
      OWNER, "aal2", `insert into public.people (first_name, last_name) values ('Pia', 'Proposal') returning id`
    );
    const j = await db.as<{ id: string }>(
      OWNER, "aal2", `insert into public.journeys (track, person_id, stage) values ($1, $2, $3) returning id`,
      [track, person.rows[0].id, stage]
    );
    return j.rows[0].id;
  };
  const propose = (jid: string, value = 7500) =>
    db.as<{ id: string }>(
      OWNER, "aal2",
      `insert into public.proposals (journey_id, title, value, sent_on) values ($1, 'First phase', $2, current_date) returning id`,
      [jid, value]
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
    journeyId = await newJourney("client", "meeting");
  });

  it("moves the journey to Proposal and takes the proposal's value when one is sent", async () => {
    await propose(journeyId, 9000);
    expect(await journey(journeyId)).toMatchObject({ stage: "proposal", value: 9000, client_status: null });
    const history = await db.admin(
      `select to_stage from public.journey_stage_history where journey_id = $1 order by changed_at, to_stage`,
      [journeyId]
    );
    expect(history.rows.map((r) => r.to_stage)).toContain("proposal");
  });

  it("makes them a client at Onboarding, with the care tasks, when accepted", async () => {
    const proposal = await db.admin(`select id from public.proposals where journey_id = $1`, [journeyId]);
    await db.as(OWNER, "aal2", `update public.proposals set status = 'accepted', decided_on = current_date where id = $1`, [
      proposal.rows[0].id,
    ]);
    expect(await journey(journeyId)).toMatchObject({ stage: "client", status: "open", client_status: "onboarding" });
    expect(await openCare(journeyId)).toEqual(["check_in", "payment", "referral_ask"]);
  });

  it("leaves the journey alone when a proposal is declined", async () => {
    const other = await newJourney("client", "contacted");
    const p = await propose(other);
    await db.as(OWNER, "aal2", `update public.proposals set status = 'declined', decided_on = current_date where id = $1`, [
      p.rows[0].id,
    ]);
    expect(await journey(other)).toMatchObject({ stage: "proposal", status: "open" });
  });

  it("needs a decision date once decided, and refuses partner journeys", async () => {
    const p = await propose(await newJourney("client", "meeting"));
    await expect(
      db.as(OWNER, "aal2", `update public.proposals set status = 'accepted' where id = $1`, [p.rows[0].id])
    ).rejects.toThrow(/proposals_decided_has_date/);
    await expect(propose(await newJourney("partner", "one_to_one"))).rejects.toThrow(/client journeys/);
  });

  it("cancels the care tasks when a client has ended, and stops the repeats", async () => {
    await db.as(OWNER, "aal2", `update public.journeys set client_status = 'ended' where id = $1`, [journeyId]);
    expect(await openCare(journeyId)).toEqual([]);
    const cancelled = await db.admin(`select count(*)::int as n from public.tasks where journey_id = $1 and status = 'cancelled'`, [
      journeyId,
    ]);
    expect(cancelled.rows[0].n).toBe(3);
  });

  it("restarts the monthly tasks when an ended client comes back", async () => {
    await db.as(OWNER, "aal2", `update public.journeys set client_status = 'active' where id = $1`, [journeyId]);
    expect(await openCare(journeyId)).toEqual(["check_in", "payment"]);
  });

  it("clears the client status when a client moves back a stage, and refuses it elsewhere", async () => {
    const back = await newJourney("client", "client");
    expect((await journey(back)).client_status).toBe("onboarding");
    await db.as(OWNER, "aal2", `update public.journeys set stage = 'proposal' where id = $1`, [back]);
    expect((await journey(back)).client_status).toBeNull();
    await expect(
      db.as(OWNER, "aal2", `update public.journeys set client_status = 'unhappy' where id = $1`, [journeyId])
    ).rejects.toThrow(/check constraint/);
  });

  it("backfill: gives an existing client any care tasks they're missing, once", async () => {
    const existing = await newJourney("client", "client");
    await db.admin(`update public.tasks set status = 'cancelled' where journey_id = $1`, [existing]);
    await db.pg.exec(BACKFILL);
    await db.pg.exec(BACKFILL);
    expect(await openCare(existing)).toEqual(["check_in", "payment", "referral_ask"]);
  });

  it("keeps proposals inside the workspace and behind two-factor", async () => {
    await expect(propose(journeyId).then(() => db.as(OWNER, "aal1", `select id from public.proposals`))).resolves.toMatchObject({
      rows: [],
    });
    const outsider = await db.as(OUTSIDER, "aal2", `select id from public.proposals`);
    expect(outsider.rows).toEqual([]);
    await expect(
      db.as(
        OUTSIDER, "aal2",
        `insert into public.proposals (journey_id, title, value, sent_on) values ($1, 'Sneaky', 1, current_date)`,
        [journeyId]
      )
    ).rejects.toThrow(/foreign key|row-level security/);
  });
});
