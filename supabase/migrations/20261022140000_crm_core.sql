-- Phase 1a: organisations, people, journeys (with stage history), touches and tasks.
--
-- Rollback:
--   drop view if exists public.journey_overview;
--   drop table if exists public.tasks, public.interaction_people, public.interactions,
--     public.journey_stage_history, public.journeys, public.people, public.organisations,
--     public.exit_reasons, public.sources;
--   drop function if exists private.my_workspace_id(), private.stamp_row(),
--     private.journey_before_write(), private.record_stage_change(),
--     private.seed_workspace_defaults(uuid);
--   then re-run the bootstrap_first_workspace definition from 20261022120000_workspaces.sql.

-- The signed-in user's workspace; the default for every workspace_id column.
create or replace function private.my_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id from public.workspace_members m
  where m.user_id = (select auth.uid())
  order by m.created_at
  limit 1
$$;

revoke all on function private.my_workspace_id() from public;
grant execute on function private.my_workspace_id() to authenticated;

-- Audit columns, and workspace_id can never move a row between workspaces.
create or replace function private.stamp_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.workspace_id := old.workspace_id;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  grp text not null check (grp in ('bni', 'referral', 'inbound', 'outbound', 'event', 'network')),
  sort_order int not null default 0,
  active boolean not null default true,
  unique (workspace_id, id),
  unique (workspace_id, label)
);

create table if not exists public.exit_reasons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  side text not null check (side in ('ours', 'theirs')),
  sort_order int not null default 0,
  active boolean not null default true,
  unique (workspace_id, id),
  unique (workspace_id, label)
);

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  industry text check (char_length(industry) <= 120),
  size_band text check (size_band in ('1', '2-10', '11-50', '51-200', '200+')),
  turnover_band text check (turnover_band in ('under_1m', '1m_5m', '5m_20m', '20m_50m', 'over_50m')),
  city text check (char_length(city) <= 120),
  website text check (char_length(website) <= 300),
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id)
);

create unique index if not exists organisations_name_idx on public.organisations (workspace_id, lower(name));

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text check (char_length(last_name) <= 80),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 40),
  organisation_id uuid,
  role_title text check (char_length(role_title) <= 120),
  birthday date,
  bni_chapter text check (char_length(bni_chapter) <= 80),
  is_bni_member boolean not null default false,
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  foreign key (workspace_id, organisation_id)
    references public.organisations (workspace_id, id) on delete set null (organisation_id)
);

create index if not exists people_organisation_idx on public.people (organisation_id);
create index if not exists people_email_idx on public.people (workspace_id, lower(email));

create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  track text not null check (track in ('client', 'partner')),
  person_id uuid,
  organisation_id uuid,
  stage text not null default 'prospect',
  status text not null default 'open' check (status in ('open', 'lost', 'parked')),
  source_id uuid,
  referred_by_person_id uuid,
  value_estimate numeric(12, 2) check (value_estimate >= 0),
  chance_pct smallint check (chance_pct between 0 and 100),
  parked_until date,
  exit_stage text,
  exit_reason_id uuid,
  exit_note text check (char_length(exit_note) <= 2000),
  opened_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  constraint journeys_has_subject check (person_id is not null or organisation_id is not null),
  constraint journeys_stage_fits_track check (
    (track = 'client' and stage in ('prospect', 'contacted', 'meeting', 'proposal', 'client'))
    or (track = 'partner' and stage in ('prospect', 'contacted', 'one_to_one', 'active'))
  ),
  -- Nothing closes without a reason; parking also needs a revisit date.
  constraint journeys_closed_has_reason check (
    status = 'open' or (exit_reason_id is not null and exit_stage is not null and closed_at is not null)
  ),
  constraint journeys_parked_has_date check (status <> 'parked' or parked_until is not null),
  constraint journeys_open_is_clean check (
    status <> 'open'
    or (exit_reason_id is null and exit_stage is null and parked_until is null and closed_at is null)
  ),
  foreign key (workspace_id, person_id)
    references public.people (workspace_id, id) on delete cascade,
  foreign key (workspace_id, organisation_id)
    references public.organisations (workspace_id, id) on delete set null (organisation_id),
  foreign key (workspace_id, source_id)
    references public.sources (workspace_id, id) on delete set null (source_id),
  foreign key (workspace_id, referred_by_person_id)
    references public.people (workspace_id, id) on delete set null (referred_by_person_id),
  foreign key (workspace_id, exit_reason_id)
    references public.exit_reasons (workspace_id, id)
);

create index if not exists journeys_board_idx on public.journeys (workspace_id, track, status, stage);
create index if not exists journeys_person_idx on public.journeys (person_id);
create index if not exists journeys_organisation_idx on public.journeys (organisation_id);

create table if not exists public.journey_stage_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  journey_id uuid not null,
  from_stage text,
  to_stage text not null,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  foreign key (workspace_id, journey_id)
    references public.journeys (workspace_id, id) on delete cascade
);

create index if not exists journey_stage_history_journey_idx on public.journey_stage_history (journey_id, changed_at);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  type text not null check (type in ('email', 'whatsapp', 'call', 'bni_message', 'meeting', 'note')),
  direction text check (direction in ('out', 'in')),
  occurred_at timestamptz not null default now(),
  summary text check (char_length(summary) <= 10000),
  outcome text check (outcome in ('no_reply', 'replied', 'interested', 'not_interested', 'meeting_booked')),
  journey_id uuid,
  organisation_id uuid,
  meeting_purpose text check (meeting_purpose in ('sales', 'referral', 'client_care')),
  meeting_setting text check (meeting_setting in ('bni_one_to_one', 'external', 'online')),
  next_step text check (char_length(next_step) <= 500),
  created_via text not null default 'manual'
    check (created_via in ('manual', 'import', 'booking', 'email_bcc', 'whatsapp_export', 'voice')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  -- Messages and calls go one way or the other; meetings and notes don't.
  constraint interactions_direction_fits_type check ((type in ('meeting', 'note')) = (direction is null)),
  constraint interactions_meeting_fields check (
    type = 'meeting' or (meeting_purpose is null and meeting_setting is null)
  ),
  foreign key (workspace_id, journey_id)
    references public.journeys (workspace_id, id) on delete set null (journey_id),
  foreign key (workspace_id, organisation_id)
    references public.organisations (workspace_id, id) on delete set null (organisation_id)
);

create index if not exists interactions_journey_idx on public.interactions (journey_id, occurred_at desc);

create table if not exists public.interaction_people (
  workspace_id uuid not null default private.my_workspace_id(),
  interaction_id uuid not null,
  person_id uuid not null,
  primary key (interaction_id, person_id),
  foreign key (workspace_id, interaction_id)
    references public.interactions (workspace_id, id) on delete cascade,
  foreign key (workspace_id, person_id)
    references public.people (workspace_id, id) on delete cascade
);

create index if not exists interaction_people_person_idx on public.interaction_people (person_id);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  kind text not null default 'other'
    check (kind in ('follow_up', 'check_in', 'birthday', 'payment', 'referral_ask', 'revisit', 'other')),
  due_on date not null,
  status text not null default 'open' check (status in ('open', 'done')),
  person_id uuid,
  journey_id uuid,
  origin text not null default 'manual' check (origin in ('manual', 'auto')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint tasks_done_has_time check ((status = 'done') = (completed_at is not null)),
  foreign key (workspace_id, person_id)
    references public.people (workspace_id, id) on delete cascade,
  foreign key (workspace_id, journey_id)
    references public.journeys (workspace_id, id) on delete cascade
);

create index if not exists tasks_due_idx on public.tasks (workspace_id, status, due_on);
create index if not exists tasks_person_idx on public.tasks (person_id);

-- Triggers --------------------------------------------------------------------

drop trigger if exists stamp_row on public.organisations;
create trigger stamp_row before insert or update on public.organisations
  for each row execute function private.stamp_row();
drop trigger if exists stamp_row on public.people;
create trigger stamp_row before insert or update on public.people
  for each row execute function private.stamp_row();
drop trigger if exists stamp_row on public.journeys;
create trigger stamp_row before insert or update on public.journeys
  for each row execute function private.stamp_row();
drop trigger if exists stamp_row on public.interactions;
create trigger stamp_row before insert or update on public.interactions
  for each row execute function private.stamp_row();
drop trigger if exists stamp_row on public.tasks;
create trigger stamp_row before insert or update on public.tasks
  for each row execute function private.stamp_row();

create or replace function private.journey_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists journey_before_write on public.journeys;
create trigger journey_before_write before update on public.journeys
  for each row execute function private.journey_before_write();

-- Stage history is written here, not by the app, so no code path can skip it.
create or replace function private.record_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    or new.stage is distinct from old.stage
    or new.status is distinct from old.status then
    insert into public.journey_stage_history
      (workspace_id, journey_id, from_stage, to_stage, from_status, to_status, changed_by)
    values (
      new.workspace_id, new.id,
      case when tg_op = 'UPDATE' then old.stage end, new.stage,
      case when tg_op = 'UPDATE' then old.status end, new.status,
      auth.uid()
    );
  end if;
  return null;
end;
$$;

revoke all on function private.record_stage_change() from public;

drop trigger if exists record_stage_change on public.journeys;
create trigger record_stage_change after insert or update on public.journeys
  for each row execute function private.record_stage_change();

-- Default lists for a workspace (editable later in Settings).
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
$$;

revoke all on function private.seed_workspace_defaults(uuid) from public;

create or replace function private.bootstrap_first_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  perform pg_advisory_xact_lock(hashtext('konzult_crm_bootstrap_workspace'));
  if not exists (select 1 from public.workspaces) then
    insert into public.workspaces (name) values ('Konzult') returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
    perform private.seed_workspace_defaults(ws);
  end if;
  return new;
end;
$$;

-- Row-level security ----------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'sources', 'exit_reasons', 'organisations', 'people', 'journeys',
    'journey_stage_history', 'interactions', 'interaction_people', 'tasks'
  ] loop
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

    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;

  -- Records the app creates and edits. Deleting people, organisations and
  -- journeys waits for the POPIA delete/anonymise flow.
  foreach t in array array['organisations', 'people', 'journeys', 'interactions', 'interaction_people', 'tasks'] loop
    execute format('drop policy if exists "members add" on public.%I', t);
    execute format(
      'create policy "members add" on public.%I for insert to authenticated
         with check (private.is_workspace_member(workspace_id))', t);
    execute format('grant insert on public.%I to authenticated', t);
  end loop;

  foreach t in array array['organisations', 'people', 'journeys', 'interactions', 'tasks'] loop
    execute format('drop policy if exists "members change" on public.%I', t);
    execute format(
      'create policy "members change" on public.%I for update to authenticated
         using (private.is_workspace_member(workspace_id))
         with check (private.is_workspace_member(workspace_id))', t);
    execute format('grant update on public.%I to authenticated', t);
  end loop;

  foreach t in array array['interactions', 'interaction_people', 'tasks'] loop
    execute format('drop policy if exists "members remove" on public.%I', t);
    execute format(
      'create policy "members remove" on public.%I for delete to authenticated
         using (private.is_workspace_member(workspace_id))', t);
    execute format('grant delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Board and Today read from this view. security_invoker keeps the callers' RLS.
create or replace view public.journey_overview
with (security_invoker = true)
as
select
  j.id,
  j.workspace_id,
  j.track,
  j.stage,
  j.status,
  j.person_id,
  coalesce(j.organisation_id, p.organisation_id) as organisation_id,
  coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), o.name) as display_name,
  o.name as organisation_name,
  j.value_estimate,
  j.chance_pct,
  j.parked_until,
  j.exit_stage,
  er.label as exit_reason,
  er.side as exit_side,
  s.label as source,
  nullif(btrim(concat_ws(' ', rp.first_name, rp.last_name)), '') as referred_by,
  j.opened_at,
  j.stage_changed_at,
  j.closed_at,
  (
    select max(i.occurred_at) from public.interactions i
    where i.journey_id = j.id
      or (j.person_id is not null and exists (
        select 1 from public.interaction_people ip
        where ip.interaction_id = i.id and ip.person_id = j.person_id
      ))
  ) as last_touch_at,
  (
    select min(t.due_on) from public.tasks t
    where t.journey_id = j.id and t.status = 'open'
  ) as next_task_on
from public.journeys j
left join public.people p on p.id = j.person_id
left join public.organisations o on o.id = coalesce(j.organisation_id, p.organisation_id)
left join public.sources s on s.id = j.source_id
left join public.exit_reasons er on er.id = j.exit_reason_id
left join public.people rp on rp.id = j.referred_by_person_id;

revoke all on public.journey_overview from anon, authenticated;
grant select on public.journey_overview to authenticated;
