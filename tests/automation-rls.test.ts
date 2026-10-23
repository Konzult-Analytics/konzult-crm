// Phase 1c database rules: the fit score, client-care tasks when a journey is
// won, and monthly tasks that schedule their next occurrence.
import { describe, it, expect, beforeAll } from "vitest";
import { migratedDb, type Who } from "./support/pgdb";

type Db = Awaited<ReturnType<typeof migratedDb>>;

const OWNER: Who = { id: "00000000-0000-4000-8000-000000000001", email: "owner@konzult.test" };

describe("automations", () => {
  let db: Db;
  let journeyId: string;
  const saToday = async () => (await db.admin(`select private.sa_today()::text as d`)).rows[0].d as string;

  beforeAll(async () => {
    db = await migratedDb();
    await db.addUser(OWNER);
    const person = await db.as<{ id: string }>(
      OWNER, "aal2", `insert into public.people (first_name, last_name) values ('Cleo', 'Client') returning id`
    );
    const journey = await db.as<{ id: string }>(
      OWNER, "aal2", `insert into public.journeys (track, person_id, stage) values ('client', $1, 'proposal') returning id`,
      [person.rows[0].id]
    );
    journeyId = journey.rows[0].id;
  });

  it("scores the fit check from the answers given", async () => {
    const score = async (answers: string) => {
      await db.as(OWNER, "aal2", `update public.journeys set ${answers} where id = $1`, [journeyId]);
      return (await db.as(OWNER, "aal2", `select fit_score from public.journey_overview where id = $1`, [journeyId])).rows[0]
        .fit_score;
    };
    expect(await score(`fit_need = null, fit_timing = null, fit_budget = null, fit_decision = null`)).toBeNull();
    expect(await score(`fit_need = 'yes', fit_timing = 'yes', fit_budget = 'yes', fit_decision = 'yes'`)).toBe(100);
    expect(await score(`fit_need = 'yes', fit_timing = 'maybe', fit_budget = 'no', fit_decision = null`)).toBe(50);
    expect(await score(`fit_need = 'no', fit_timing = 'no', fit_budget = 'no', fit_decision = 'no'`)).toBe(0);
  });

  it("sets up client care when a journey is won, once", async () => {
    await db.as(OWNER, "aal2", `update public.journeys set stage = 'client' where id = $1`, [journeyId]);
    const today = await saToday();
    const tasks = await db.as<{ title: string; kind: string; days: number; repeat_rule: string | null; origin: string }>(
      OWNER, "aal2",
      `select title, kind, (due_on - $2::date) as days, repeat_rule, origin from public.tasks where journey_id = $1 order by kind`,
      [journeyId, today]
    );
    expect(tasks.rows).toEqual([
      { title: "Monthly check-in with Cleo Client", kind: "check_in", days: 30, repeat_rule: "monthly", origin: "auto" },
      { title: "Check payment from Cleo Client", kind: "payment", days: 7, repeat_rule: "monthly", origin: "auto" },
      { title: "Ask Cleo Client for a testimonial and a referral", kind: "referral_ask", days: 60, repeat_rule: null, origin: "auto" },
    ]);

    // Moving back and forward again doesn't duplicate the open tasks.
    await db.as(OWNER, "aal2", `update public.journeys set stage = 'proposal' where id = $1`, [journeyId]);
    await db.as(OWNER, "aal2", `update public.journeys set stage = 'client' where id = $1`, [journeyId]);
    const count = await db.admin(`select count(*)::int as n from public.tasks where journey_id = $1`, [journeyId]);
    expect(count.rows[0].n).toBe(3);
  });

  it("schedules the next monthly task when one is ticked off", async () => {
    const task = await db.admin(`select id, due_on::text as due from public.tasks where journey_id = $1 and kind = 'check_in'`, [journeyId]);
    await db.as(OWNER, "aal2",
      `update public.tasks set status = 'done', completed_at = now() where id = $1`, [task.rows[0].id]);
    const open = await db.admin(
      `select (due_on - $2::date) as gap from public.tasks where journey_id = $1 and kind = 'check_in' and status = 'open'`,
      [journeyId, task.rows[0].due]
    );
    expect(open.rows).toHaveLength(1);
    expect([28, 29, 30, 31]).toContain(open.rows[0].gap);
  });

  it("doesn't repeat one-off tasks", async () => {
    const ask = await db.admin(`select id from public.tasks where journey_id = $1 and kind = 'referral_ask'`, [journeyId]);
    await db.as(OWNER, "aal2", `update public.tasks set status = 'done', completed_at = now() where id = $1`, [ask.rows[0].id]);
    const n = await db.admin(`select count(*)::int as n from public.tasks where journey_id = $1 and kind = 'referral_ask'`, [journeyId]);
    expect(n.rows[0].n).toBe(1);
  });

  it("stops repeating once the journey has ended", async () => {
    const reason = await db.admin(`select id from public.exit_reasons where label = 'Bad timing'`);
    await db.as(OWNER, "aal2",
      `update public.journeys set status = 'lost', exit_reason_id = $2, exit_stage = stage, closed_at = now() where id = $1`,
      [journeyId, reason.rows[0].id]);
    const pay = await db.admin(`select id from public.tasks where journey_id = $1 and kind = 'payment' and status = 'open'`, [journeyId]);
    await db.as(OWNER, "aal2", `update public.tasks set status = 'done', completed_at = now() where id = $1`, [pay.rows[0].id]);
    const open = await db.admin(`select count(*)::int as n from public.tasks where journey_id = $1 and kind = 'payment' and status = 'open'`, [journeyId]);
    expect(open.rows[0].n).toBe(0);
  });

  it("keeps fit answers to the allowed values", async () => {
    await expect(
      db.as(OWNER, "aal2", `update public.journeys set fit_need = 'definitely' where id = $1`, [journeyId])
    ).rejects.toThrow(/check constraint/);
  });
});
