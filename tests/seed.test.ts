import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { migratedDb } from "./support/pgdb";

const seedFile = (name: string) => readFileSync(path.join(__dirname, "../supabase", name), "utf-8");
// The order supabase/config.toml loads them in.
const SEEDS = ["seed.sql", "seed-phase1c.sql", "seed-phase2a.sql"].map(seedFile);
const OWNER = { id: "00000000-0000-4000-8000-000000000001", email: "zander.kotze@konzult.co.za" };
const DEV_TESTER = { id: "00000000-0000-4000-8000-000000000003", email: "claude-test+dev@konzult.co.za" };

// Each test builds a fresh in-memory database, which takes a few seconds.
describe("dev seed", { timeout: 30_000 }, () => {
  it("loads the sample data once, even when run twice", async () => {
    const db = await migratedDb();
    await db.addUser(OWNER);
    await db.addUser(DEV_TESTER);
    for (const seed of [...SEEDS, ...SEEDS]) await db.pg.exec(seed);
    const counts = await db.admin(
      `select (select count(*)::int from public.people) as people,
              (select count(*)::int from public.journeys) as journeys,
              (select count(*)::int from public.journeys where status <> 'open') as closed,
              (select count(*)::int from public.tasks) as tasks,
              (select count(*)::int from public.workspace_members) as members,
              (select count(*)::int from public.proposals) as proposals,
              (select client_status from public.journey_overview where display_name = 'Sarah Nel') as sarah`
    );
    // Tasks: 4 written in the seed, plus Sarah Nel's 3 client-care tasks from the trigger.
    expect(counts.rows[0]).toEqual({ people: 15, journeys: 15, closed: 3, tasks: 7, members: 2, proposals: 3, sarah: "active" });
  });

  it("refuses to run without the dev-only test login (production)", async () => {
    const db = await migratedDb();
    await db.addUser(OWNER);
    for (const seed of SEEDS) await expect(db.pg.exec(seed)).rejects.toThrow(/dev only/);
  });
});
