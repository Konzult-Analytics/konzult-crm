// A real Postgres (PGlite, in memory) with every migration applied, so the RLS
// tests exercise the actual policies. Supabase's auth schema is stubbed with
// just what the migrations touch; auth.uid() and auth.jwt() read the same
// request settings PostgREST sets.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = path.join(__dirname, "../../supabase/migrations");

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export type Who = { id: string; email: string };
export type Aal = "aal1" | "aal2";

export async function migratedDb() {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await pg.exec(readFileSync(path.join(MIGRATIONS, file), "utf-8"));
    } catch (e) {
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  }

  /** Run SQL as the database superuser (seeding and inspection). */
  const admin = (sql: string, params: unknown[] = []) => pg.query<Record<string, unknown>>(sql, params);

  /**
   * Run SQL as a signed-in user, exactly as PostgREST would: the
   * `authenticated` role with the user's JWT claims. Each call is its own
   * transaction, so a refused write never leaks into the next check.
   */
  async function as<T = Record<string, unknown>>(who: Who, aal: Aal, sql: string, params: unknown[] = []) {
    return pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: who.id, email: who.email, role: "authenticated", aal }),
      ]);
      await tx.exec("set local role authenticated");
      return tx.query<T>(sql, params);
    });
  }

  /** Run SQL as a logged-out visitor. */
  async function anon<T = Record<string, unknown>>(sql: string) {
    return pg.transaction(async (tx) => {
      await tx.exec("set local role anon");
      return tx.query<T>(sql);
    });
  }

  async function addUser(who: Who) {
    await admin("insert into auth.users (id, email) values ($1, $2)", [who.id, who.email]);
  }

  return { pg, admin, as, anon, addUser };
}
