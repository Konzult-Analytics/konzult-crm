import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { migratedDb } from "./support/pgdb";

const SEED = readFileSync(path.join(__dirname, "../supabase/seed.sql"), "utf-8");
const OWNER = { id: "00000000-0000-4000-8000-000000000001", email: "zander.kotze@konzult.co.za" };
const DEV_TESTER = { id: "00000000-0000-4000-8000-000000000003", email: "claude-test+dev@konzult.co.za" };

// Each test builds a fresh in-memory database, which takes a few seconds.
describe("dev seed", { timeout: 30_000 }, () => {
  it("loads the sample data once, even when run twice", async () => {
    const db = await migratedDb();
    await db.addUser(OWNER);
    await db.addUser(DEV_TESTER);
    await db.pg.exec(SEED);
    await db.pg.exec(SEED);
    const counts = await db.admin(
      `select (select count(*)::int from public.people) as people,
              (select count(*)::int from public.journeys) as journeys,
              (select count(*)::int from public.journeys where status <> 'open') as closed,
              (select count(*)::int from public.tasks) as tasks,
              (select count(*)::int from public.workspace_members) as members`
    );
    expect(counts.rows[0]).toEqual({ people: 12, journeys: 12, closed: 2, tasks: 4, members: 2 });
  });

  it("refuses to run without the dev-only test login (production)", async () => {
    const db = await migratedDb();
    await db.addUser(OWNER);
    await expect(db.pg.exec(SEED)).rejects.toThrow(/dev only/);
  });
});
