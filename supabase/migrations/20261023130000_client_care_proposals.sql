-- Phase 2a: client sub-status, testimonial and referral outcomes, proposals
-- that move the journey, and a 'cancelled' state for tasks that no longer apply.
--
-- Rollback:
--   drop trigger if exists proposal_moves_journey on public.proposals;
--   drop table if exists public.proposals;
--   drop trigger if exists client_status_set on public.journeys;
--   drop trigger if exists client_status_changed on public.journeys;
--   then re-run private.client_care_tasks(), private.repeat_task() and the
--   journey_overview definition from 20261023090000_automations.sql;
--   drop function if exists private.proposal_moves_journey(), private.client_status_set(),
--     private.client_status_changed(), private.add_client_care_tasks(uuid, boolean);
--   update public.tasks set status = 'done', completed_at = updated_at where status = 'cancelled';
--   alter table public.tasks drop constraint tasks_status_check,
--     add constraint tasks_status_check check (status in ('open', 'done'));
--   alter table public.journeys drop constraint if exists journeys_client_status_on_clients,
--     drop column if exists client_status, drop column if exists testimonial_status,
--     drop column if exists testimonial_quote, drop column if exists referral_status;

-- Care tasks that stop applying (a client who has left) are cancelled, not deleted.
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('open', 'done', 'cancelled'));

alter table public.journeys
  add column if not exists client_status text
    check (client_status in ('onboarding', 'active', 'at_risk', 'paused', 'ended')),
  add column if not exists testimonial_status text check (testimonial_status in ('asked', 'received', 'declined')),
  add column if not exists testimonial_quote text check (char_length(testimonial_quote) <= 2000),
  add column if not exists referral_status text check (referral_status in ('asked', 'given', 'declined'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'journeys_client_status_on_clients') then
    alter table public.journeys add constraint journeys_client_status_on_clients
      check (client_status is null or (track = 'client' and stage = 'client'));
  end if;
end;
$$;

-- A new client starts at Onboarding; leaving the Client stage clears the status.
create or replace function private.client_status_set()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.track = 'client' and new.stage = 'client' then
    new.client_status := coalesce(new.client_status, 'onboarding');
  else
    new.client_status := null;
  end if;
  return new;
end;
$$;

drop trigger if exists client_status_set on public.journeys;
create trigger client_status_set before insert or update of stage, track, client_status on public.journeys
  for each row execute function private.client_status_set();

-- The client-care set (spec 7), shared by the "journey won" trigger, a client
-- coming back after Ended, and the backfill. Skips any kind already open.
create or replace function private.add_client_care_tasks(p_journey uuid, p_referral_ask boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_j record;
  v_today date := private.sa_today();
begin
  select j.id, j.workspace_id, j.person_id,
    coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), o.name, 'this client') as name
  into v_j
  from public.journeys j
  left join public.people p on p.id = j.person_id
  left join public.organisations o on o.id = coalesce(j.organisation_id, p.organisation_id)
  where j.id = p_journey;
  if not found then
    return;
  end if;

  insert into public.tasks (workspace_id, title, kind, due_on, person_id, journey_id, origin, repeat_rule)
  select v_j.workspace_id, left(x.title, 200), x.kind, x.due, v_j.person_id, v_j.id, 'auto', x.rep
  from (values
    ('Monthly check-in with ' || v_j.name, 'check_in', v_today + 30, 'monthly'),
    ('Check payment from ' || v_j.name, 'payment', v_today + 7, 'monthly'),
    ('Ask ' || v_j.name || ' for a testimonial and a referral', 'referral_ask', v_today + 60, null)
  ) as x (title, kind, due, rep)
  where (x.kind <> 'referral_ask' or p_referral_ask)
    and not exists (
      select 1 from public.tasks t
      where t.journey_id = v_j.id and t.kind = x.kind and t.status = 'open' and t.origin = 'auto'
    );
end;
$$;

create or replace function private.client_care_tasks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.track = 'client' and new.stage = 'client' and new.status = 'open'
    and (tg_op = 'INSERT' or old.stage is distinct from 'client') then
    perform private.add_client_care_tasks(new.id, true);
  end if;
  return null;
end;
$$;

-- Ended cancels the open care tasks; coming back restarts the monthly ones.
create or replace function private.client_status_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.client_status = 'ended' and old.client_status is distinct from 'ended' then
    update public.tasks set status = 'cancelled'
    where journey_id = new.id and status = 'open' and origin = 'auto'
      and kind in ('check_in', 'payment', 'referral_ask');
  elsif old.client_status = 'ended' and new.client_status is distinct from 'ended' and new.status = 'open' then
    perform private.add_client_care_tasks(new.id, false);
  end if;
  return null;
end;
$$;

drop trigger if exists client_status_changed on public.journeys;
create trigger client_status_changed after update of client_status on public.journeys
  for each row execute function private.client_status_changed();

-- Monthly tasks stop repeating once the journey closes or the client has ended.
create or replace function private.repeat_task()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_next date;
  v_today date := private.sa_today();
begin
  if new.status = 'done' and old.status = 'open' and new.repeat_rule = 'monthly'
    and (new.journey_id is null or exists (
      select 1 from public.journeys j
      where j.id = new.journey_id and j.status = 'open' and j.client_status is distinct from 'ended'
    )) then
    v_next := (old.due_on + interval '1 month')::date;
    while v_next <= v_today loop
      v_next := (v_next + interval '1 month')::date;
    end loop;
    insert into public.tasks (workspace_id, title, kind, due_on, person_id, journey_id, origin, repeat_rule)
    values (new.workspace_id, new.title, new.kind, v_next, new.person_id, new.journey_id, new.origin, new.repeat_rule);
  end if;
  return null;
end;
$$;

-- Proposals (spec 11): one row per proposal sent on a client journey.
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  journey_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  value numeric(12, 2) not null check (value between 0 and 100000000),
  sent_on date not null,
  status text not null default 'sent' check (status in ('sent', 'accepted', 'declined')),
  decided_on date,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  constraint proposals_decided_has_date check ((status = 'sent') = (decided_on is null)),
  foreign key (workspace_id, journey_id)
    references public.journeys (workspace_id, id) on delete cascade
);

create index if not exists proposals_journey_idx on public.proposals (journey_id);

drop trigger if exists stamp_row on public.proposals;
create trigger stamp_row before insert or update on public.proposals
  for each row execute function private.stamp_row();

-- Sending a proposal moves the journey to Proposal; acceptance makes them a
-- client. The proposal's value becomes the deal value. Forward moves only.
create or replace function private.proposal_moves_journey()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_track text;
  v_status text;
begin
  select j.track, j.status into v_track, v_status from public.journeys j where j.id = new.journey_id;
  if v_track is distinct from 'client' then
    raise exception 'proposals belong to client journeys' using errcode = 'check_violation';
  end if;
  if v_status = 'open' and new.status in ('sent', 'accepted') then
    update public.journeys j
    set value_estimate = new.value,
        stage = case
          when new.status = 'accepted' then 'client'
          when j.stage in ('prospect', 'contacted', 'meeting') then 'proposal'
          else j.stage
        end
    where j.id = new.journey_id;
  end if;
  return null;
end;
$$;

drop trigger if exists proposal_moves_journey on public.proposals;
create trigger proposal_moves_journey after insert or update of status, value on public.proposals
  for each row execute function private.proposal_moves_journey();

revoke all on function private.client_status_set(), private.add_client_care_tasks(uuid, boolean),
  private.client_care_tasks(), private.client_status_changed(), private.repeat_task(),
  private.proposal_moves_journey() from public;
-- Called from triggers that run with the caller's rights.
grant execute on function private.add_client_care_tasks(uuid, boolean) to authenticated;

alter table public.proposals enable row level security;
drop policy if exists "two-factor required" on public.proposals;
create policy "two-factor required" on public.proposals as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
drop policy if exists "members read" on public.proposals;
create policy "members read" on public.proposals for select to authenticated
  using (private.is_workspace_member(workspace_id));
drop policy if exists "members add" on public.proposals;
create policy "members add" on public.proposals for insert to authenticated
  with check (private.is_workspace_member(workspace_id));
drop policy if exists "members change" on public.proposals;
create policy "members change" on public.proposals for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));
revoke all on public.proposals from anon, authenticated;
grant select, insert, update on public.proposals to authenticated;

-- The board view gains the client status (added at the end, as replace requires).
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
  ) as next_task_on,
  c.name as campaign,
  j.fit_score,
  j.client_status
from public.journeys j
left join public.people p on p.id = j.person_id
left join public.organisations o on o.id = coalesce(j.organisation_id, p.organisation_id)
left join public.sources s on s.id = j.source_id
left join public.exit_reasons er on er.id = j.exit_reason_id
left join public.people rp on rp.id = j.referred_by_person_id
left join public.campaigns c on c.id = j.campaign_id;

revoke all on public.journey_overview from anon, authenticated;
grant select on public.journey_overview to authenticated;
