// Phase 2b database rules: document shapes, default templates, and the public
// tracked-link functions (what a logged-out visitor can and can't reach).
import { describe, it, expect, beforeAll } from "vitest";
import { migratedDb, type Who } from "./support/pgdb";

type Db = Awaited<ReturnType<typeof migratedDb>>;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER: Who = { id: id(1), email: "owner@konzult.test" };
const OUTSIDER: Who = { id: id(2), email: "outsider@elsewhere.test" };
const token = (c: string) => c.repeat(32);

describe("documents, templates and tracked links", { timeout: 30_000 }, () => {
  let db: Db;
  let personId: string;
  let libraryId: string;

  const send = async (tok: string, extra = "") => {
    await db.as(
      OWNER, "aal2",
      `insert into public.asset_sends (document_id, person_id, channel, share_token, target_url, expires_at)
       values ($1, $2, 'email', $3, 'https://example.test/file.pdf', now() + interval '12 months')`,
      [libraryId, personId, tok]
    );
    if (extra) await db.admin(`update public.asset_sends set ${extra} where share_token = $1`, [tok]);
  };
  const open = (tok: string, count = true) =>
    db.anon<{ target_url: string | null; state: string }>(`select * from public.share_open('${tok}', ${count})`);

  beforeAll(async () => {
    db = await migratedDb();
    await db.addUser(OWNER);
    await db.addUser(OUTSIDER);
    await db.admin(
      `with ws as (insert into public.workspaces (name) values ('Elsewhere') returning id)
       insert into public.workspace_members (workspace_id, user_id, role) select id, $1, 'owner' from ws`,
      [OUTSIDER.id]
    );
    const person = await db.as<{ id: string }>(
      OWNER, "aal2", `insert into public.people (first_name, last_name) values ('Dora', 'Document') returning id`
    );
    personId = person.rows[0].id;
    const doc = await db.as<{ id: string }>(
      OWNER, "aal2",
      `insert into public.documents (kind, title, url, is_library, service, audience)
       values ('marketing', 'The Map explained', 'https://example.test/the-map', true, 'The Map', 'Business owners') returning id`
    );
    libraryId = doc.rows[0].id;
  });

  it("gives a new workspace the default templates", async () => {
    const t = await db.as(OWNER, "aal2", `select name, purpose from public.templates order by sort_order`);
    expect(t.rows).toEqual([
      { name: "Thank you after a one-to-one", purpose: "personal" },
      { name: "Visitor follow-up", purpose: "marketing" },
      { name: "Proposal cover note", purpose: "personal" },
      { name: "Client check-in", purpose: "personal" },
      { name: "Consent request", purpose: "consent_request" },
      { name: "Book a time", purpose: "personal" },
    ]);
  });

  it("keeps documents to a file or a link, and library items unattached", async () => {
    await expect(
      db.as(OWNER, "aal2", `insert into public.documents (kind, title, is_library, person_id, url)
        values ('marketing', 'x', true, $1, 'https://example.test')`, [personId])
    ).rejects.toThrow(/documents_library_shape/);
    await expect(
      db.as(OWNER, "aal2", `insert into public.documents (kind, title, url) values ('report', 'Loose', 'https://example.test')`)
    ).rejects.toThrow(/documents_library_shape/);
    await expect(
      db.as(OWNER, "aal2", `insert into public.documents (kind, title, person_id) values ('report', 'Nothing', $1)`, [personId])
    ).rejects.toThrow(/documents_file_or_link/);
    const ok = await db.as(OWNER, "aal2",
      `insert into public.documents (kind, title, person_id, storage_path, file_name)
       values ('contract', 'Engagement letter', $1, 'ws/doc/v1/letter.pdf', 'letter.pdf') returning version`, [personId]);
    expect(ok.rows[0].version).toBe(1);
  });

  it("opens a tracked link for a logged-out visitor and counts it", async () => {
    await send(token("a"));
    const info = await db.anon(`select * from public.share_info('${token("a")}')`);
    expect(info.rows).toEqual([{ title: "The Map explained", state: "ok" }]);
    expect((await open(token("a"))).rows).toEqual([{ target_url: "https://example.test/file.pdf", state: "ok" }]);
    await open(token("a"));
    await open(token("a"), false);
    const row = await db.admin(
      `select open_count, first_opened_at is not null as opened from public.asset_sends where share_token = $1`,
      [token("a")]
    );
    expect(row.rows[0]).toEqual({ open_count: 2, opened: true });
  });

  it("refuses switched-off, expired, unknown and malformed links", async () => {
    await send(token("b"), "revoked_at = now()");
    await send(token("c"), "expires_at = now() - interval '1 day'");
    expect((await open(token("b"))).rows).toEqual([{ target_url: null, state: "revoked" }]);
    expect((await open(token("c"))).rows).toEqual([{ target_url: null, state: "expired" }]);
    expect((await open(token("z"))).rows).toEqual([]);
    expect((await db.anon(`select * from public.share_open('short')`)).rows).toEqual([]);
    expect((await db.anon(`select * from public.share_info('''; drop table x; --')`)).rows).toEqual([]);
  });

  it("throttles one link to 30 opens an hour", async () => {
    await send(token("d"), "window_started_at = now(), window_opens = 30");
    expect((await open(token("d"))).rows).toEqual([{ target_url: null, state: "busy" }]);
    await db.admin(`update public.asset_sends set window_started_at = now() - interval '2 hours' where share_token = $1`, [token("d")]);
    expect((await open(token("d"))).rows[0].state).toBe("ok");
  });

  it("keeps the tables themselves away from visitors, other workspaces and unverified sessions", async () => {
    await expect(db.anon(`select share_token from public.asset_sends`)).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select title from public.documents`)).rejects.toThrow(/permission denied/);
    expect((await db.as(OUTSIDER, "aal2", `select id from public.documents`)).rows).toEqual([]);
    expect((await db.as(OUTSIDER, "aal2", `select id from public.asset_sends`)).rows).toEqual([]);
    expect((await db.as(OWNER, "aal1", `select id from public.templates`)).rows).toEqual([]);
  });

  it("links a proposal to its document and a sent touch to its template", async () => {
    const journey = await db.as<{ id: string }>(
      OWNER, "aal2", `insert into public.journeys (track, person_id, stage) values ('client', $1, 'meeting') returning id`, [personId]
    );
    const doc = await db.as<{ id: string }>(
      OWNER, "aal2",
      `insert into public.documents (kind, title, journey_id, person_id, storage_path) values ('proposal', 'Proposal', $1, $2, 'ws/p/v1/p.pdf') returning id`,
      [journey.rows[0].id, personId]
    );
    const p = await db.as(
      OWNER, "aal2",
      `insert into public.proposals (journey_id, title, value, sent_on, document_id) values ($1, 'First phase', 7500, current_date, $2) returning document_id`,
      [journey.rows[0].id, doc.rows[0].id]
    );
    expect(p.rows[0].document_id).toBe(doc.rows[0].id);
    const template = await db.as<{ id: string }>(OWNER, "aal2", `select id from public.templates where purpose = 'consent_request'`);
    const touch = await db.as(
      OWNER, "aal2",
      `insert into public.interactions (type, direction, summary, template_id, created_via) values ('email', 'out', 'Consent request', $1, 'send') returning created_via`,
      [template.rows[0].id]
    );
    expect(touch.rows[0].created_via).toBe("send");
  });
});
