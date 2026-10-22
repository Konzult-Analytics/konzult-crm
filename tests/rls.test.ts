// Workspace isolation and the two-factor gate, proven against the real
// migrations. A public table added later fails the "every table" test until it
// gets RLS and the restrictive two-factor policy.
import { describe, it, expect, beforeAll } from "vitest";
import { migratedDb, type Who } from "./support/pgdb";

type Db = Awaited<ReturnType<typeof migratedDb>>;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER: Who = { id: id(1), email: "owner@konzult.test" };
const SECOND: Who = { id: id(2), email: "second@konzult.test" };

describe("workspaces", () => {
  let db: Db;

  beforeAll(async () => {
    db = await migratedDb();
    await db.addUser(OWNER);
    await db.addUser(SECOND);
  });

  it("makes the first account owner of one Konzult workspace", async () => {
    const ws = await db.admin("select name from public.workspaces");
    expect(ws.rows).toEqual([{ name: "Konzult" }]);
    const members = await db.admin("select user_id, role from public.workspace_members");
    expect(members.rows).toEqual([{ user_id: OWNER.id, role: "owner" }]);
  });

  it("lets the owner read the workspace once two-factor is passed", async () => {
    const ws = await db.as(OWNER, "aal2", "select name from public.workspaces");
    expect(ws.rows).toEqual([{ name: "Konzult" }]);
    const m = await db.as(OWNER, "aal2", "select role from public.workspace_members");
    expect(m.rows).toEqual([{ role: "owner" }]);
  });

  it("hides everything from a session that has only passed the password step", async () => {
    expect((await db.as(OWNER, "aal1", "select * from public.workspaces")).rows).toEqual([]);
    expect((await db.as(OWNER, "aal1", "select * from public.workspace_members")).rows).toEqual([]);
  });

  it("hides the workspace from an account that isn't a member", async () => {
    expect((await db.as(SECOND, "aal2", "select * from public.workspaces")).rows).toEqual([]);
    expect((await db.as(SECOND, "aal2", "select * from public.workspace_members")).rows).toEqual([]);
  });

  it("refuses logged-out visitors", async () => {
    await expect(db.anon("select * from public.workspaces")).rejects.toThrow(/permission denied/);
    await expect(db.anon("select * from public.workspace_members")).rejects.toThrow(/permission denied/);
  });

  it("refuses writes from the app, even by the owner", async () => {
    const attempts = [
      `insert into public.workspaces (name) values ('Rogue')`,
      `update public.workspaces set name = 'Renamed'`,
      `delete from public.workspaces`,
      `insert into public.workspace_members (workspace_id, user_id, role)
         select id, '${SECOND.id}', 'owner' from public.workspaces`,
      `update public.workspace_members set role = 'member'`,
      `delete from public.workspace_members`,
    ];
    for (const sql of attempts) {
      await expect(db.as(OWNER, "aal2", sql)).rejects.toThrow(/permission denied/);
    }
  });

  it("keeps the helper functions out of reach of logged-out visitors", async () => {
    await expect(db.anon(`select private.is_workspace_member('${id(9)}')`)).rejects.toThrow(
      /permission denied/
    );
  });
});

describe("every public table", () => {
  it("has RLS on and the restrictive two-factor policy", async () => {
    const db = await migratedDb();
    const tables = await db.admin(`
      select c.relname as name, c.relrowsecurity as rls,
        exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.relname
            and p.permissive = 'RESTRICTIVE' and p.qual like '%aal2%'
        ) as mfa
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`);
    expect(tables.rows.length).toBeGreaterThan(0);
    for (const t of tables.rows) {
      expect({ table: t.name, rls: t.rls, mfa: t.mfa }).toEqual({ table: t.name, rls: true, mfa: true });
    }
  });
});
