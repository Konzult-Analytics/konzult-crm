// Phase 3a database rules: referrals (shape, and a received referral following
// its client journey), the one-to-one target setting, and campaign details.
import { describe, it, expect, beforeAll } from "vitest";
import { migratedDb, type Who } from "./support/pgdb";

type Db = Awaited<ReturnType<typeof migratedDb>>;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER: Who = { id: id(1), email: "owner@konzult.test" };
const OUTSIDER: Who = { id: id(2), email: "outsider@elsewhere.test" };

describe("BNI referrals, targets and campaigns", { timeout: 30_000 }, () => {
  let db: Db;
  let memberId: string;

  const person = async (first: string) =>
    (await db.as<{ id: string }>(OWNER, "aal2", `insert into public.people (first_name) values ($1) returning id`, [first])).rows[0].id;
  const referral = async (jid: string) =>
    (
      await db.admin(`select status, closed_value::float as value, closed_on is not null as closed from public.referrals where journey_id = $1`, [
        jid,
      ])
    ).rows[0];

  beforeAll(async () => {
    db = await migratedDb();
    await db.addUser(OWNER);
    await db.addUser(OUTSIDER);
    await db.admin(
      `with ws as (insert into public.workspaces (name) values ('Elsewhere') returning id)
       insert into public.workspace_members (workspace_id, user_id, role) select id, $1, 'owner' from ws`,
      [OUTSIDER.id]
    );
    memberId = await person("Gerhard");
  });

  it("needs someone referred: a person in the CRM or a name", async () => {
    await expect(
      db.as(OWNER, "aal2", `insert into public.referrals (direction, member_person_id, referred_on) values ('given', $1, current_date)`, [memberId])
    ).rejects.toThrow(/referrals_has_contact/);
    const given = await db.as(
      OWNER, "aal2",
      `insert into public.referrals (direction, member_person_id, contact_name, referred_on, temperature)
       values ('given', $1, 'A plumber from my street', current_date, 4) returning status`,
      [memberId]
    );
    expect(given.rows[0].status).toBe("open");
    await expect(
      db.as(OWNER, "aal2", `insert into public.referrals (direction, member_person_id, contact_name, referred_on, temperature)
        values ('given', $1, 'x', current_date, 9)`, [memberId])
    ).rejects.toThrow(/check constraint/);
  });

  it("moves a received referral along with its client journey, and records the business won", async () => {
    const contact = await person("Rita");
    const journey = await db.as<{ id: string }>(
      OWNER, "aal2",
      `insert into public.journeys (track, person_id, referred_by_person_id) values ('client', $1, $2) returning id`,
      [contact, memberId]
    );
    const jid = journey.rows[0].id;
    await db.as(
      OWNER, "aal2",
      `insert into public.referrals (direction, member_person_id, contact_person_id, journey_id, referred_on, temperature)
       values ('received', $1, $2, $3, current_date, 5)`,
      [memberId, contact, jid]
    );
    await db.as(OWNER, "aal2", `update public.journeys set stage = 'contacted' where id = $1`, [jid]);
    expect(await referral(jid)).toMatchObject({ status: "contacted", closed: false });
    await db.as(OWNER, "aal2", `update public.journeys set stage = 'client', value_estimate = 7500 where id = $1`, [jid]);
    expect(await referral(jid)).toEqual({ status: "won", value: 7500, closed: true });
  });

  it("marks a received referral lost when its journey is lost", async () => {
    const contact = await person("Lulu");
    const jid = (
      await db.as<{ id: string }>(OWNER, "aal2", `insert into public.journeys (track, person_id) values ('client', $1) returning id`, [contact])
    ).rows[0].id;
    await db.as(
      OWNER, "aal2",
      `insert into public.referrals (direction, member_person_id, contact_person_id, journey_id, referred_on) values ('received', $1, $2, $3, current_date)`,
      [memberId, contact, jid]
    );
    const reason = await db.admin(`select id from public.exit_reasons where label = 'No real need'`);
    await db.as(
      OWNER, "aal2",
      `update public.journeys set status = 'lost', exit_reason_id = $2, exit_stage = stage, closed_at = now() where id = $1`,
      [jid, reason.rows[0].id]
    );
    expect(await referral(jid)).toMatchObject({ status: "lost", closed: true });
  });

  it("keeps the one-to-one target per workspace, within limits", async () => {
    await db.as(OWNER, "aal2", `insert into public.workspace_settings (one_to_one_target) values (5)`);
    await db.as(OWNER, "aal2", `update public.workspace_settings set one_to_one_target = 3, one_to_one_target_on = false`);
    const s = await db.as(OWNER, "aal2", `select one_to_one_target, one_to_one_target_on from public.workspace_settings`);
    expect(s.rows).toEqual([{ one_to_one_target: 3, one_to_one_target_on: false }]);
    await expect(db.as(OWNER, "aal2", `update public.workspace_settings set one_to_one_target = 0`)).rejects.toThrow(/check constraint/);
  });

  it("keeps referrals and settings inside the workspace and behind two-factor", async () => {
    expect((await db.as(OUTSIDER, "aal2", `select id from public.referrals`)).rows).toEqual([]);
    expect((await db.as(OUTSIDER, "aal2", `select workspace_id from public.workspace_settings`)).rows).toEqual([]);
    expect((await db.as(OWNER, "aal1", `select id from public.referrals`)).rows).toEqual([]);
    await expect(db.anon(`select id from public.referrals`)).rejects.toThrow(/permission denied/);
  });

  it("stores campaign channel, start date and message", async () => {
    const c = await db.as(
      OWNER, "aal2",
      `insert into public.campaigns (name, track, channel, started_on, message) values ('Accountants Oct', 'partner', 'email', current_date, 'Hi {first_name}') returning active, channel`
    );
    expect(c.rows[0]).toEqual({ active: true, channel: "email" });
    await expect(
      db.as(OWNER, "aal2", `insert into public.campaigns (name, track, channel) values ('x', 'client', 'carrier pigeon')`)
    ).rejects.toThrow(/check constraint/);
  });
});
