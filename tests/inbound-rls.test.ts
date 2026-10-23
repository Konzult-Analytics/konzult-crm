// Phase 3b: the Cal.com and website doors, called the way the web routes call
// them (as a logged-out visitor with the connection key), and what they may
// and may not do.
import { createHash } from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { migratedDb, type Who } from "./support/pgdb";

type Db = Awaited<ReturnType<typeof migratedDb>>;

const OWNER: Who = { id: "00000000-0000-4000-8000-000000000001", email: "owner@konzult.test" };
const CAL_KEY = "c".repeat(48);
const WEB_KEY = "w".repeat(48);
const hash = (k: string) => createHash("sha256").update(k, "utf8").digest("hex");

describe("inbound doors", { timeout: 30_000 }, () => {
  let db: Db;

  const cal = async (event: Record<string, unknown>, key = CAL_KEY) =>
    (await db.anon<{ r: string }>(`select public.inbound_cal('${key}', '${JSON.stringify(event).replaceAll("'", "''")}'::jsonb) as r`))
      .rows[0].r;
  const web = async (lead: Record<string, unknown>, key = WEB_KEY) =>
    (await db.anon<{ r: string }>(`select public.inbound_website('${key}', '${JSON.stringify(lead).replaceAll("'", "''")}'::jsonb) as r`))
      .rows[0].r;
  const booking = (uid: string, extra: Record<string, unknown> = {}) => ({
    event: "created",
    uid,
    slug: "discovery-call",
    title: "Discovery call",
    starts_at: "2026-11-03T08:00:00Z", // Tuesday 10:00 in South Africa
    ends_at: "2026-11-03T08:45:00Z",
    name: "Bongani Booker",
    email: "Bongani@Example.test",
    phone: "082 555 0101",
    business: "Booker Brands",
    notes: "Wants to talk cash flow.",
    ...extra,
  });

  beforeAll(async () => {
    db = await migratedDb();
    await db.addUser(OWNER);
    for (const [kind, key] of [["cal", CAL_KEY], ["website", WEB_KEY]]) {
      await db.as(OWNER, "aal2", `insert into public.inbound_connections (kind, key_hash, key_hint) values ($1, $2, $3)`, [
        kind, hash(key), key.slice(-4),
      ]);
    }
  });

  it("refuses unknown and malformed keys without touching anything", async () => {
    expect(await cal(booking("x1"), "z".repeat(48))).toBe("unknown");
    expect(await cal(booking("x1"), "short")).toBe("unknown");
    expect(await web({ id: "s1" }, CAL_KEY)).toBe("unknown"); // a Cal.com key doesn't open the website door
    expect((await db.admin(`select count(*)::int as n from public.bookings`)).rows[0].n).toBe(0);
  });

  it("captures a new booking: person, business, client journey at Meeting, note and prep task", async () => {
    expect(await cal(booking("b1"))).toBe("booked");
    const row = (
      await db.admin(`
        select p.first_name, p.last_name, p.email, p.phone, o.name as business, j.track, j.stage, s.label as source,
               b.status, t.title as task, t.due_on::text as due, t.status as task_status,
               (select summary from public.interactions i join public.interaction_people ip on ip.interaction_id = i.id
                where ip.person_id = p.id and i.created_via = 'booking') as note
        from public.bookings b
        join public.people p on p.id = b.person_id
        join public.organisations o on o.id = p.organisation_id
        join public.journeys j on j.id = b.journey_id
        join public.sources s on s.id = j.source_id
        join public.tasks t on t.id = b.prep_task_id
        where b.external_uid = 'b1'`)
    ).rows[0];
    expect(row).toMatchObject({
      first_name: "Bongani",
      last_name: "Booker",
      email: "bongani@example.test",
      business: "Booker Brands",
      track: "client",
      stage: "meeting",
      source: "Booking link",
      status: "booked",
      task: 'Prepare for "Discovery call" with Bongani Booker',
      due: "2026-11-02",
      task_status: "open",
    });
    expect(row.note).toContain("Tue 03 Nov, 10:00");
  });

  it("records each booking once, however often it's delivered", async () => {
    expect(await cal(booking("b1"))).toBe("duplicate");
    expect((await db.admin(`select count(*)::int as n from public.people where email = 'bongani@example.test'`)).rows[0].n).toBe(1);
  });

  it("matches an existing person by cell number when no email came with it, and books a one-to-one on the partner track", async () => {
    expect(await cal(booking("b2", { slug: "bni-one-to-one", title: "BNI one-to-one", email: null, phone: "+27 82 555 0101" }))).toBe("booked");
    const r = await db.admin(`
      select count(distinct b.person_id)::int as people, (select stage from public.journeys where track = 'partner') as stage
      from public.bookings b`);
    expect(r.rows[0]).toEqual({ people: 1, stage: "one_to_one" });
  });

  it("doesn't match by cell number when the emails differ (a shared office line)", async () => {
    expect(await cal(booking("b3", { email: "colleague@example.test", phone: "082 555 0101", name: "Cara Colleague" }))).toBe("booked");
    const r = await db.admin(`select count(*)::int as n from public.people where right(regexp_replace(phone, '\\D', '', 'g'), 9) = '825550101'`);
    expect(r.rows[0].n).toBe(2);
  });

  it("moves a booking and its prep task when it's rescheduled, and cancels both when it's cancelled", async () => {
    expect(
      await cal({ ...booking("b1-new"), event: "rescheduled", previous_uid: "b1", starts_at: "2026-11-09T07:00:00Z", ends_at: "2026-11-09T07:45:00Z" })
    ).toBe("rescheduled");
    const moved = await db.admin(`
      select b.starts_at = '2026-11-09T07:00:00Z'::timestamptz as moved, t.due_on::text as due
      from public.bookings b join public.tasks t on t.id = b.prep_task_id where b.external_uid = 'b1-new'`);
    expect(moved.rows[0]).toEqual({ moved: true, due: "2026-11-06" }); // Monday's meeting: prep on Friday

    expect(await cal({ event: "cancelled", uid: "b1-new" })).toBe("cancelled");
    const cancelled = await db.admin(`
      select b.status, t.status as task from public.bookings b join public.tasks t on t.id = b.prep_task_id where b.external_uid = 'b1-new'`);
    expect(cancelled.rows[0]).toEqual({ status: "cancelled", task: "cancelled" });
    expect(await cal({ event: "cancelled", uid: "b1-new" })).toBe("ignored");
  });

  it("logs a kickoff without moving anyone, and brings a parked journey back for a new booking", async () => {
    const person = await db.as<{ id: string }>(
      OWNER, "aal2", `insert into public.people (first_name, email) values ('Pat', 'pat@example.test') returning id`
    );
    const reason = await db.admin(`select id from public.exit_reasons where label = 'Bad timing'`);
    await db.as(
      OWNER, "aal2",
      `insert into public.journeys (track, person_id, stage, status, exit_stage, exit_reason_id, closed_at, parked_until)
       values ('client', $1, 'contacted', 'parked', 'contacted', $2, now(), current_date + 30)`,
      [person.rows[0].id, reason.rows[0].id]
    );
    expect(await cal(booking("k1", { slug: "next-stage-kickoff", email: "pat@example.test", phone: null }))).toBe("booked");
    expect((await db.admin(`select status, stage from public.journeys where person_id = $1`, [person.rows[0].id])).rows[0]).toEqual({
      status: "parked",
      stage: "contacted",
    });
    expect(await cal(booking("k2", { email: "pat@example.test", phone: null }))).toBe("booked");
    expect((await db.admin(`select status, stage, parked_until from public.journeys where person_id = $1`, [person.rows[0].id])).rows[0]).toEqual({
      status: "open",
      stage: "meeting",
      parked_until: null,
    });
  });

  it("puts website enquiries in the inbox once each, with their consent", async () => {
    const lead = { event: "lead", id: "sub-1", name: "Wendy Web", email: "Wendy@Example.test", phone: "082 555 0202", business: "Web Works", message: "Can you help with pricing?", marketing_consent: true };
    expect(await web(lead)).toBe("received");
    expect(await web(lead)).toBe("duplicate");
    const r = await db.admin(`select email, marketing_consent, status, person_id from public.inbound_leads`);
    expect(r.rows).toEqual([{ email: "wendy@example.test", marketing_consent: true, status: "new", person_id: null }]);
    expect((await db.admin(`select count(*)::int as n from public.people where email = 'wendy@example.test'`)).rows[0].n).toBe(0);
  });

  it("records a failed signature on the connection, so set-up problems show in the CRM", async () => {
    expect(await web({ event: "bad_signature" })).toBe("bad_signature");
    expect((await db.admin(`select last_event_status from public.inbound_connections where kind = 'website'`)).rows[0].last_event_status).toBe(
      "bad_signature"
    );
  });

  it("throttles a connection to 60 events an hour, and refuses a switched-off one", async () => {
    await db.admin(`update public.inbound_connections set window_started_at = now(), window_events = 60 where kind = 'website'`);
    expect(await web({ event: "lead", id: "sub-2" })).toBe("busy");
    await db.as(OWNER, "aal2", `update public.inbound_connections set revoked_at = now() where kind = 'website'`);
    await db.admin(`update public.inbound_connections set window_events = 0 where kind = 'website'`);
    expect(await web({ event: "lead", id: "sub-3" })).toBe("unknown");
  });

  it("gives visitors nothing to read, and the doors nothing beyond their own job", async () => {
    for (const t of ["bookings", "inbound_leads", "inbound_connections"]) {
      await expect(db.anon(`select * from public.${t}`)).rejects.toThrow(/permission denied/);
    }
    await expect(db.anon(`select private.inbound_person(null, 'x', 'x@x.test', null, null)`)).rejects.toThrow(/permission denied/);
    await expect(db.as(OWNER, "aal2", `insert into public.bookings (external_uid, starts_at) values ('x', now())`)).rejects.toThrow(
      /permission denied/
    );
  });

  it("counts back to the working day before", async () => {
    const r = await db.admin(`select private.working_day_before('2026-11-09')::text as mon, private.working_day_before('2026-11-04')::text as wed,
      private.working_day_before('2026-11-08')::text as sun`);
    expect(r.rows[0]).toEqual({ mon: "2026-11-06", wed: "2026-11-03", sun: "2026-11-06" });
  });
});
