-- Phase 3b: two signed doors for outside services. Cal.com bookings are
-- captured automatically; website enquiries land in an inbox for one-tap
-- review. Each door has its own connection key, created in the CRM and stored
-- only as a SHA-256 fingerprint. The web route checks the sender's signature
-- (made with the same key); these functions check the key itself, so calling
-- them directly without it does nothing.
--
-- Rollback:
--   drop function if exists public.inbound_cal(text, jsonb), public.inbound_website(text, jsonb),
--     private.inbound_connection(text, text), private.inbound_throttle(uuid),
--     private.inbound_person(uuid, text, text, text, text), private.working_day_before(date),
--     private.inbound_cal_create(public.inbound_connections, jsonb), private.sa_label(timestamptz);
--   drop table if exists public.inbound_leads, public.bookings, public.inbound_connections;
--   alter table public.interactions drop constraint interactions_created_via_check,
--     add constraint interactions_created_via_check check (created_via in
--     ('manual', 'import', 'booking', 'email_bcc', 'whatsapp_export', 'voice', 'send'));

alter table public.interactions drop constraint if exists interactions_created_via_check;
alter table public.interactions add constraint interactions_created_via_check check (
  created_via in ('manual', 'import', 'booking', 'email_bcc', 'whatsapp_export', 'voice', 'send', 'website')
);

create table if not exists public.inbound_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('cal', 'website')),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  key_hint text not null check (char_length(key_hint) = 4),
  revoked_at timestamptz,
  last_event_at timestamptz,
  last_event_status text check (char_length(last_event_status) <= 40),
  -- At most 60 events an hour per connection.
  window_started_at timestamptz,
  window_events int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  connection_id uuid,
  external_uid text not null check (char_length(external_uid) between 1 and 200),
  event_slug text check (char_length(event_slug) <= 100),
  title text check (char_length(title) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  attendee_name text check (char_length(attendee_name) <= 160),
  attendee_email text check (char_length(attendee_email) <= 254),
  attendee_phone text check (char_length(attendee_phone) <= 40),
  business text check (char_length(business) <= 160),
  notes text check (char_length(notes) <= 2000),
  person_id uuid,
  journey_id uuid,
  prep_task_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  unique (workspace_id, external_uid),
  foreign key (workspace_id, connection_id)
    references public.inbound_connections (workspace_id, id) on delete set null (connection_id),
  foreign key (workspace_id, person_id)
    references public.people (workspace_id, id) on delete cascade,
  foreign key (workspace_id, journey_id)
    references public.journeys (workspace_id, id) on delete set null (journey_id),
  foreign key (prep_task_id) references public.tasks (id) on delete set null
);

create index if not exists bookings_starts_idx on public.bookings (workspace_id, status, starts_at);

create table if not exists public.inbound_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  connection_id uuid,
  external_id text not null check (char_length(external_id) between 1 and 200),
  name text check (char_length(name) <= 160),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 40),
  business text check (char_length(business) <= 160),
  message text check (char_length(message) <= 4000),
  marketing_consent boolean not null default false,
  received_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'added', 'discarded')),
  person_id uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  unique (workspace_id, external_id),
  foreign key (workspace_id, connection_id)
    references public.inbound_connections (workspace_id, id) on delete set null (connection_id),
  foreign key (workspace_id, person_id)
    references public.people (workspace_id, id) on delete set null (person_id)
);

do $$
declare
  t text;
begin
  foreach t in array array['inbound_connections', 'bookings', 'inbound_leads'] loop
    execute format('drop trigger if exists stamp_row on public.%I', t);
    execute format(
      'create trigger stamp_row before insert or update on public.%I for each row execute function private.stamp_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "two-factor required" on public.%I', t);
    execute format(
      'create policy "two-factor required" on public.%I as restrictive for all to authenticated
         using ((select auth.jwt() ->> %L) = %L) with check ((select auth.jwt() ->> %L) = %L)',
      t, 'aal', 'aal2', 'aal', 'aal2');
    execute format('drop policy if exists "members read" on public.%I', t);
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using (private.is_workspace_member(workspace_id))', t);
    execute format('drop policy if exists "members change" on public.%I', t);
    execute format(
      'create policy "members change" on public.%I for update to authenticated
         using (private.is_workspace_member(workspace_id))
         with check (private.is_workspace_member(workspace_id))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, update on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Only connections are created from the app; bookings and leads arrive through the doors.
drop policy if exists "members add" on public.inbound_connections;
create policy "members add" on public.inbound_connections for insert to authenticated
  with check (private.is_workspace_member(workspace_id));
grant insert on public.inbound_connections to authenticated;

-- Helpers below run as the owner from the door functions; none is callable from outside.

create or replace function private.inbound_connection(p_kind text, p_key text)
returns public.inbound_connections
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.inbound_connections c
  where c.kind = p_kind and c.revoked_at is null
    and p_key ~ '^[A-Za-z0-9_-]{48}$'
    and c.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
$$;

create or replace function private.inbound_throttle(p_connection uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.inbound_connections;
begin
  select * into c from public.inbound_connections where id = p_connection for update;
  if c.window_started_at is null or c.window_started_at <= now() - interval '1 hour' then
    update public.inbound_connections set window_started_at = now(), window_events = 1 where id = p_connection;
    return true;
  end if;
  if c.window_events >= 60 then
    return false;
  end if;
  update public.inbound_connections set window_events = window_events + 1 where id = p_connection;
  return true;
end;
$$;

create or replace function private.working_day_before(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case extract(isodow from p_date)
    when 1 then p_date - 3 -- Monday: the Friday before
    when 7 then p_date - 2 -- Sunday: Friday
    else p_date - 1
  end
$$;

-- "Tue 28 Oct, 10:00" in South African time (UTC+2 all year).
create or replace function private.sa_label(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char((p_at at time zone 'UTC') + interval '2 hours', 'Dy DD Mon, HH24:MI')
$$;

-- Finds a person by email, then by the last nine digits of their cell, or adds
-- them. Existing people only gain blanks, as with imports.
create or replace function private.inbound_person(p_workspace uuid, p_name text, p_email text, p_phone text, p_business text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_org uuid;
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if nullif(btrim(coalesce(p_business, '')), '') is not null then
    select o.id into v_org from public.organisations o
    where o.workspace_id = p_workspace and lower(o.name) = lower(btrim(p_business));
    if v_org is null then
      insert into public.organisations (workspace_id, name) values (p_workspace, left(btrim(p_business), 160))
      returning id into v_org;
    end if;
  end if;

  if nullif(p_email, '') is not null then
    select p.id into v_person from public.people p
    where p.workspace_id = p_workspace and lower(p.email) = lower(p_email)
    order by p.created_at limit 1;
  end if;
  if v_person is null and char_length(v_digits) = 9 then
    select p.id into v_person from public.people p
    where p.workspace_id = p_workspace and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = v_digits
    order by p.created_at limit 1;
  end if;

  if v_person is null then
    v_name := coalesce(v_name, split_part(coalesce(p_email, 'Unknown'), '@', 1));
    insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id)
    values (
      p_workspace,
      left(split_part(v_name, ' ', 1), 80),
      nullif(left(btrim(substr(v_name, char_length(split_part(v_name, ' ', 1)) + 1)), 80), ''),
      nullif(lower(p_email), ''),
      nullif(left(p_phone, 40), ''),
      v_org
    )
    returning id into v_person;
  else
    update public.people p
    set email = coalesce(p.email, nullif(lower(p_email), '')),
        phone = coalesce(p.phone, nullif(left(p_phone, 40), '')),
        organisation_id = coalesce(p.organisation_id, v_org)
    where p.id = v_person;
  end if;
  return v_person;
end;
$$;

-- A new booking: the person, their journey moved forward, the booking, a note
-- on the timeline and a prep task due the working day before.
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
      (select s.id from public.sources s where s.workspace_id = ws and s.label = 'Booking link'))
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
      attendee_name, attendee_email, attendee_phone, business, notes, person_id, journey_id)
  values (ws, c.id, e->>'uid', nullif(e->>'slug', ''), v_title, v_starts, (e->>'ends_at')::timestamptz,
      nullif(e->>'name', ''), nullif(e->>'email', ''), nullif(e->>'phone', ''), nullif(e->>'business', ''),
      nullif(e->>'notes', ''), v_person, j.id)
  returning id into v_booking;

  insert into public.interactions (workspace_id, type, summary, journey_id, organisation_id, created_via)
  values (ws, 'note',
    left(format('Booked "%s" for %s via Cal.com.%s', v_title, private.sa_label(v_starts),
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
--  uid, previous_uid, slug, title, starts_at, ends_at, name, email, phone, business, notes}.
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
          ends_at = (p_event->>'ends_at')::timestamptz, status = 'booked'
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
      update public.bookings set status = 'cancelled' where id = b.id;
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

-- The website door: the enquiry waits in the inbox for Zander to add or bin it.
-- p_lead: {event: lead | bad_signature | spam, id, name, email, phone, business, message, marketing_consent}.
create or replace function public.inbound_website(p_key text, p_lead jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.inbound_connections;
  v_event text := coalesce(p_lead->>'event', 'lead');
  v_result text;
  v_id uuid;
begin
  c := private.inbound_connection('website', p_key);
  if c.id is null then
    return 'unknown';
  end if;
  if not private.inbound_throttle(c.id) then
    return 'busy';
  end if;

  if v_event = 'lead' then
    insert into public.inbound_leads (workspace_id, connection_id, external_id, name, email, phone, business, message,
        marketing_consent)
    values (c.workspace_id, c.id, p_lead->>'id', nullif(p_lead->>'name', ''), nullif(lower(p_lead->>'email'), ''),
        nullif(p_lead->>'phone', ''), nullif(p_lead->>'business', ''), nullif(p_lead->>'message', ''),
        coalesce((p_lead->>'marketing_consent')::boolean, false))
    on conflict (workspace_id, external_id) do nothing
    returning id into v_id;
    v_result := case when v_id is null then 'duplicate' else 'received' end;
  elsif v_event in ('bad_signature', 'spam') then
    v_result := v_event;
  else
    v_result := 'ignored';
  end if;

  update public.inbound_connections set last_event_at = now(), last_event_status = v_result where id = c.id;
  return v_result;
end;
$$;

revoke all on function private.inbound_connection(text, text), private.inbound_throttle(uuid),
  private.working_day_before(date), private.sa_label(timestamptz),
  private.inbound_person(uuid, text, text, text, text),
  private.inbound_cal_create(public.inbound_connections, jsonb),
  public.inbound_cal(text, jsonb), public.inbound_website(text, jsonb) from public;
grant execute on function public.inbound_cal(text, jsonb), public.inbound_website(text, jsonb) to anon, authenticated;
