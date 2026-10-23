-- Phase 3a: BNI referrals given and received (with the Rand value of closed
-- business, BNI's TYFCB), workspace settings for the weekly one-to-one target,
-- and campaign details for the campaign manager.
--
-- Rollback:
--   drop trigger if exists referral_follows_journey on public.journeys;
--   drop function if exists private.referral_follows_journey();
--   drop table if exists public.referrals, public.workspace_settings;
--   alter table public.campaigns drop column if exists channel, drop column if exists started_on,
--     drop column if exists message, drop column if exists active;

-- One row per workspace; the app treats a missing row as the defaults.
create table if not exists public.workspace_settings (
  workspace_id uuid primary key default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  one_to_one_target smallint not null default 5 check (one_to_one_target between 1 and 50),
  one_to_one_target_on boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Given: Zander passed a member a lead. Received: a member passed Zander one,
-- which becomes a client journey. closed_value is the business it brought.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  direction text not null check (direction in ('given', 'received')),
  member_person_id uuid not null,
  contact_person_id uuid,
  contact_name text check (char_length(contact_name) <= 120),
  referred_on date not null,
  temperature smallint check (temperature between 1 and 5),
  status text not null default 'open' check (status in ('open', 'contacted', 'won', 'lost')),
  closed_value numeric(12, 2) check (closed_value between 0 and 100000000),
  closed_on date,
  journey_id uuid,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  -- coalesce: a missing name must fail the check, not leave it unknown (which passes).
  constraint referrals_has_contact check (contact_person_id is not null or coalesce(char_length(btrim(contact_name)), 0) > 0),
  foreign key (workspace_id, member_person_id)
    references public.people (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_person_id)
    references public.people (workspace_id, id) on delete set null (contact_person_id),
  foreign key (workspace_id, journey_id)
    references public.journeys (workspace_id, id) on delete set null (journey_id)
);

create index if not exists referrals_member_idx on public.referrals (member_person_id);
create index if not exists referrals_contact_idx on public.referrals (contact_person_id);
create index if not exists referrals_journey_idx on public.referrals (journey_id);

alter table public.campaigns
  add column if not exists channel text check (channel in ('email', 'whatsapp', 'call', 'bni_message', 'mixed')),
  add column if not exists started_on date,
  add column if not exists message text check (char_length(message) <= 4000),
  add column if not exists active boolean not null default true;

do $$
declare
  t text;
begin
  foreach t in array array['workspace_settings', 'referrals'] loop
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
    execute format('drop policy if exists "members add" on public.%I', t);
    execute format(
      'create policy "members add" on public.%I for insert to authenticated
         with check (private.is_workspace_member(workspace_id))', t);
    execute format('drop policy if exists "members change" on public.%I', t);
    execute format(
      'create policy "members change" on public.%I for update to authenticated
         using (private.is_workspace_member(workspace_id))
         with check (private.is_workspace_member(workspace_id))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;

-- A received referral follows its client journey: contacted once it leaves
-- Prospect, won (with the deal value) when they become a client, lost when
-- the journey is lost. Runs with the caller's rights.
create or replace function private.referral_follows_journey()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.track = 'client' and new.stage = 'client' and new.status = 'open' and old.stage is distinct from 'client' then
    update public.referrals r
    set status = 'won',
        closed_value = coalesce(r.closed_value, new.value_estimate),
        closed_on = coalesce(r.closed_on, private.sa_today())
    where r.journey_id = new.id and r.direction = 'received' and r.status in ('open', 'contacted');
  elsif new.status = 'lost' and old.status is distinct from 'lost' then
    update public.referrals r
    set status = 'lost', closed_on = coalesce(r.closed_on, private.sa_today())
    where r.journey_id = new.id and r.direction = 'received' and r.status in ('open', 'contacted');
  elsif new.stage is distinct from 'prospect' and old.stage = 'prospect' then
    update public.referrals r
    set status = 'contacted'
    where r.journey_id = new.id and r.direction = 'received' and r.status = 'open';
  end if;
  return null;
end;
$$;

drop trigger if exists referral_follows_journey on public.journeys;
create trigger referral_follows_journey after update of stage, status on public.journeys
  for each row execute function private.referral_follows_journey();

revoke all on function private.referral_follows_journey() from public;
