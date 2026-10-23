-- Phase 3c: the calendar and booking links. A booking now remembers where it
-- came from (the public booking page, a QR code, or a link from the CRM), its
-- video link, and whether the meeting happened. Workspace settings hold the
-- Cal.com booking page and its event types, for the Book buttons and QR codes.
-- Google Calendar itself is read live by the app and never stored here.
--
-- Rollback:
--   re-run private.inbound_cal_create and public.inbound_cal from 20261023210000_inbound_bookings_leads.sql;
--   re-run private.seed_workspace_defaults from 20261023160000_documents_library_templates.sql;
--   drop function if exists private.seed_calendar_defaults(uuid), private.https_url(text);
--   alter table public.bookings drop constraint if exists bookings_outcome_needs_booking,
--     drop column if exists source, drop column if exists meeting_url,
--     drop column if exists outcome, drop column if exists outcome_at;
--   alter table public.workspace_settings drop column if exists booking_page_url, drop column if exists booking_types;
--   (the 'QR code' source and 'Book a time' template rows can stay; see 20261023230100 for removing them)

alter table public.bookings
  add column if not exists source text not null default 'link' check (source in ('link', 'qr', 'crm')),
  add column if not exists meeting_url text check (char_length(meeting_url) <= 500 and meeting_url ~ '^https://[^\s<>"]+$'),
  add column if not exists outcome text check (outcome in ('held', 'no_show')),
  add column if not exists outcome_at timestamptz;

-- Only a meeting that's still on can have happened, or not.
alter table public.bookings drop constraint if exists bookings_outcome_needs_booking;
alter table public.bookings add constraint bookings_outcome_needs_booking check (outcome is null or status = 'booked');

alter table public.workspace_settings
  add column if not exists booking_page_url text
    check (char_length(booking_page_url) <= 200 and booking_page_url ~ '^https://[^\s<>"]+$'),
  add column if not exists booking_types jsonb not null default '[]'::jsonb
    check (jsonb_typeof(booking_types) = 'array' and jsonb_array_length(booking_types) <= 12);

-- A web address that is safe to put behind a link, or null.
create or replace function private.https_url(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when char_length(p) <= 500 and p ~ '^https://[^\s<>"]+$' then p end
$$;

create or replace function private.seed_calendar_defaults(ws uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.sources (workspace_id, label, grp, sort_order) values (ws, 'QR code', 'inbound', 65)
  on conflict (workspace_id, label) do nothing;

  insert into public.templates (workspace_id, name, purpose, subject, body, sort_order) values
    (ws, 'Book a time', 'personal', 'Finding a time to talk',
     E'Hi {first_name}\n\nHere''s a link to pick a time that suits you. It shows only the times I''m free:\n\n{booking_link}\n\nZander', 60)
  on conflict (workspace_id, name) do nothing;
$$;

-- New workspaces get the QR code source and the booking template too.
create or replace function private.seed_workspace_defaults(ws uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.sources (workspace_id, label, grp, sort_order) values
    (ws, 'BNI chapter visitor', 'bni', 10),
    (ws, 'BNI one-to-one', 'bni', 20),
    (ws, 'BNI Connect search', 'bni', 30),
    (ws, 'Referral', 'referral', 40),
    (ws, 'Website', 'inbound', 50),
    (ws, 'Booking link', 'inbound', 60),
    (ws, 'Event', 'event', 70),
    (ws, 'Cold outreach', 'outbound', 80),
    (ws, 'Own network', 'network', 90)
  on conflict (workspace_id, label) do nothing;

  insert into public.exit_reasons (workspace_id, label, side, sort_order) values
    (ws, 'No real need', 'theirs', 10),
    (ws, 'No budget / too small', 'theirs', 20),
    (ws, 'Bad timing', 'theirs', 30),
    (ws, 'Doing it in-house', 'theirs', 40),
    (ws, 'Chose another provider', 'theirs', 50),
    (ws, 'Never responded', 'theirs', 60),
    (ws, 'Follow-up too slow or missed', 'ours', 110),
    (ws, 'Proposal didn''t match their need', 'ours', 120),
    (ws, 'Value wasn''t clear', 'ours', 130),
    (ws, 'Wrong or missing material', 'ours', 140),
    (ws, 'No clear next step agreed', 'ours', 150),
    (ws, 'Price objection', 'ours', 160)
  on conflict (workspace_id, label) do nothing;

  select private.seed_default_templates(ws);
  select private.seed_calendar_defaults(ws);
$$;

-- A new booking: the person, their journey moved forward, the booking, a note
-- on the timeline and a prep task due the working day before. A booking from
-- the QR code gives a new journey the source "QR code".
create or replace function private.inbound_cal_create(c public.inbound_connections, e jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid := c.workspace_id;
  v_slug text := lower(coalesce(e->>'slug', ''));
  v_track text := case when v_slug like '%one-to-one%' or v_slug like '%121%' then 'partner' else 'client' end;
  v_kickoff boolean := v_slug like '%kickoff%';
  v_target text := case when v_track = 'partner' then 'one_to_one' else 'meeting' end;
  v_order text[] := case when v_track = 'partner'
    then array['prospect', 'contacted', 'one_to_one', 'active']
    else array['prospect', 'contacted', 'meeting', 'proposal', 'client'] end;
  v_starts timestamptz := (e->>'starts_at')::timestamptz;
  v_title text := coalesce(nullif(e->>'title', ''), 'Meeting');
  v_source text := case when e->>'source' in ('qr', 'crm') then e->>'source' else 'link' end;
  v_person uuid;
  v_org uuid;
  v_name text;
  j public.journeys;
  v_booking uuid;
  v_touch uuid;
  v_task uuid;
begin
  if exists (select 1 from public.bookings b where b.workspace_id = ws and b.external_uid = e->>'uid') then
    return 'duplicate';
  end if;

  v_person := private.inbound_person(ws, e->>'name', e->>'email', e->>'phone', e->>'business');
  select p.organisation_id, coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'them')
    into v_org, v_name
  from public.people p where p.id = v_person;

  select * into j from public.journeys x
  where x.person_id = v_person and x.track = v_track and x.status <> 'lost'
  order by x.opened_at desc limit 1;

  if j.id is null and not v_kickoff then
    insert into public.journeys (workspace_id, track, person_id, source_id)
    values (ws, v_track, v_person,
      (select s.id from public.sources s
       where s.workspace_id = ws and s.label = case when v_source = 'qr' then 'QR code' else 'Booking link' end))
    returning * into j;
  end if;

  if j.id is not null and not v_kickoff then
    -- A booked meeting brings a parked journey back.
    if j.status = 'parked' then
      update public.journeys set status = 'open', exit_reason_id = null, exit_stage = null, exit_note = null,
        closed_at = null, parked_until = null
      where id = j.id;
    end if;
    if array_position(v_order, j.stage) < array_position(v_order, v_target) then
      update public.journeys set stage = v_target where id = j.id;
    end if;
  end if;

  insert into public.bookings (workspace_id, connection_id, external_uid, event_slug, title, starts_at, ends_at,
      attendee_name, attendee_email, attendee_phone, business, notes, person_id, journey_id, source, meeting_url)
  values (ws, c.id, e->>'uid', nullif(e->>'slug', ''), v_title, v_starts, (e->>'ends_at')::timestamptz,
      nullif(e->>'name', ''), nullif(e->>'email', ''), nullif(e->>'phone', ''), nullif(e->>'business', ''),
      nullif(e->>'notes', ''), v_person, j.id, v_source, private.https_url(e->>'meeting_url'))
  returning id into v_booking;

  insert into public.interactions (workspace_id, type, summary, journey_id, organisation_id, created_via)
  values (ws, 'note',
    left(format('Booked "%s" for %s via Cal.com%s.%s', v_title, private.sa_label(v_starts),
      case when v_source = 'qr' then ' (from your QR code)' else '' end,
      coalesce(E'\n\n' || nullif(e->>'notes', ''), '')), 10000),
    j.id, v_org, 'booking')
  returning id into v_touch;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, v_touch, v_person);

  insert into public.tasks (workspace_id, title, kind, due_on, person_id, journey_id, origin)
  values (ws, left(format('Prepare for "%s" with %s', v_title, v_name), 200), 'other',
    greatest(private.sa_today(), private.working_day_before(((v_starts at time zone 'UTC') + interval '2 hours')::date)),
    v_person, j.id, 'auto')
  returning id into v_task;
  update public.bookings set prep_task_id = v_task where id = v_booking;

  return 'booked';
end;
$$;

-- The Cal.com door. p_event is already validated and flattened by the web route:
-- {event: created | rescheduled | cancelled | ping | ignored | bad_signature,
--  uid, previous_uid, slug, title, starts_at, ends_at, name, email, phone, business, notes, source, meeting_url}.
create or replace function public.inbound_cal(p_key text, p_event jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.inbound_connections;
  v_event text := p_event->>'event';
  v_result text;
  b public.bookings;
begin
  c := private.inbound_connection('cal', p_key);
  if c.id is null then
    return 'unknown';
  end if;
  if not private.inbound_throttle(c.id) then
    return 'busy';
  end if;

  if v_event = 'created' then
    v_result := private.inbound_cal_create(c, p_event);
  elsif v_event = 'rescheduled' then
    select * into b from public.bookings x
    where x.workspace_id = c.workspace_id and x.external_uid in (p_event->>'previous_uid', p_event->>'uid')
    limit 1;
    if b.id is null then
      v_result := private.inbound_cal_create(c, p_event);
    else
      update public.bookings
      set external_uid = p_event->>'uid', starts_at = (p_event->>'starts_at')::timestamptz,
          ends_at = (p_event->>'ends_at')::timestamptz, status = 'booked',
          meeting_url = coalesce(private.https_url(p_event->>'meeting_url'), meeting_url),
          outcome = null, outcome_at = null
      where id = b.id;
      update public.tasks
      set due_on = greatest(private.sa_today(),
        private.working_day_before((((p_event->>'starts_at')::timestamptz at time zone 'UTC') + interval '2 hours')::date))
      where id = b.prep_task_id and status = 'open';
      if b.person_id is not null then
        with t as (
          insert into public.interactions (workspace_id, type, summary, journey_id, created_via)
          values (c.workspace_id, 'note',
            format('Rescheduled "%s" to %s via Cal.com.', b.title, private.sa_label((p_event->>'starts_at')::timestamptz)),
            b.journey_id, 'booking')
          returning id
        )
        insert into public.interaction_people (workspace_id, interaction_id, person_id)
        select c.workspace_id, t.id, b.person_id from t;
      end if;
      v_result := 'rescheduled';
    end if;
  elsif v_event = 'cancelled' then
    select * into b from public.bookings x where x.workspace_id = c.workspace_id and x.external_uid = p_event->>'uid';
    if b.id is null or b.status = 'cancelled' then
      v_result := 'ignored';
    else
      update public.bookings set status = 'cancelled', outcome = null, outcome_at = null where id = b.id;
      update public.tasks set status = 'cancelled' where id = b.prep_task_id and status = 'open';
      if b.person_id is not null then
        with t as (
          insert into public.interactions (workspace_id, type, summary, journey_id, created_via)
          values (c.workspace_id, 'note', format('Cancelled "%s" (was %s) via Cal.com.', b.title, private.sa_label(b.starts_at)),
            b.journey_id, 'booking')
          returning id
        )
        insert into public.interaction_people (workspace_id, interaction_id, person_id)
        select c.workspace_id, t.id, b.person_id from t;
      end if;
      v_result := 'cancelled';
    end if;
  elsif v_event in ('ping', 'bad_signature') then
    v_result := v_event;
  else
    v_result := 'ignored';
  end if;

  update public.inbound_connections set last_event_at = now(), last_event_status = v_result where id = c.id;
  return v_result;
end;
$$;

revoke all on function private.https_url(text), private.seed_calendar_defaults(uuid),
  private.seed_workspace_defaults(uuid), private.inbound_cal_create(public.inbound_connections, jsonb),
  public.inbound_cal(text, jsonb) from public;
grant execute on function public.inbound_cal(text, jsonb) to anon, authenticated;
