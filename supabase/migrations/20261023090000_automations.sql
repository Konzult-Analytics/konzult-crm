-- Phase 1c: fit check on journeys, client-care tasks when a journey is won,
-- and monthly tasks that schedule their next occurrence when done.
--
-- Rollback:
--   drop trigger if exists client_care_tasks on public.journeys;
--   drop trigger if exists repeat_task on public.tasks;
--   drop function if exists private.client_care_tasks(), private.repeat_task();
--   then re-run the journey_overview definition from 20261022170000_imports.sql;
--   alter table public.tasks drop column if exists repeat_rule;
--   alter table public.journeys drop column if exists fit_score, drop column if exists fit_need,
--     drop column if exists fit_timing, drop column if exists fit_budget, drop column if exists fit_decision;

-- Fit check (spec 3.4): four answers after the first sales meeting. The score
-- is the share of the best possible answers among those given: 0 to 100.
alter table public.journeys
  add column if not exists fit_need text check (fit_need in ('yes', 'maybe', 'no')),
  add column if not exists fit_timing text check (fit_timing in ('yes', 'maybe', 'no')),
  add column if not exists fit_budget text check (fit_budget in ('yes', 'maybe', 'no')),
  add column if not exists fit_decision text check (fit_decision in ('yes', 'maybe', 'no'));

alter table public.journeys
  add column if not exists fit_score smallint generated always as (
    case
      when num_nonnulls(fit_need, fit_timing, fit_budget, fit_decision) = 0 then null
      else round(
        100.0 * (
          (case fit_need when 'yes' then 2 when 'maybe' then 1 else 0 end)
          + (case fit_timing when 'yes' then 2 when 'maybe' then 1 else 0 end)
          + (case fit_budget when 'yes' then 2 when 'maybe' then 1 else 0 end)
          + (case fit_decision when 'yes' then 2 when 'maybe' then 1 else 0 end)
        ) / (2 * num_nonnulls(fit_need, fit_timing, fit_budget, fit_decision))
      )::smallint
    end
  ) stored;

alter table public.tasks
  add column if not exists repeat_rule text check (repeat_rule in ('monthly'));

-- South Africa is UTC+2 all year, so "today" there needs no time-zone tables.
create or replace function private.sa_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() + interval '2 hours')::date
$$;

-- A won client gets the client-care set (spec 7): a monthly check-in, a
-- payment check (first in a week, then monthly) and, at 60 days, a request
-- for a testimonial and a referral. Runs with the caller's rights.
create or replace function private.client_care_tasks()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
  v_today date := private.sa_today();
begin
  if new.track = 'client' and new.stage = 'client' and new.status = 'open'
    and (tg_op = 'INSERT' or old.stage is distinct from 'client') then
    select coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), o.name, 'this client')
    into v_name
    from public.journeys j
    left join public.people p on p.id = j.person_id
    left join public.organisations o on o.id = coalesce(j.organisation_id, p.organisation_id)
    where j.id = new.id;

    insert into public.tasks (workspace_id, title, kind, due_on, person_id, journey_id, origin, repeat_rule)
    select new.workspace_id, left(x.title, 200), x.kind, x.due, new.person_id, new.id, 'auto', x.rep
    from (values
      ('Monthly check-in with ' || v_name, 'check_in', v_today + 30, 'monthly'),
      ('Check payment from ' || v_name, 'payment', v_today + 7, 'monthly'),
      ('Ask ' || v_name || ' for a testimonial and a referral', 'referral_ask', v_today + 60, null)
    ) as x (title, kind, due, rep)
    where not exists (
      select 1 from public.tasks t
      where t.journey_id = new.id and t.kind = x.kind and t.status = 'open' and t.origin = 'auto'
    );
  end if;
  return null;
end;
$$;

drop trigger if exists client_care_tasks on public.journeys;
create trigger client_care_tasks after insert or update of stage on public.journeys
  for each row execute function private.client_care_tasks();

-- Ticking off a monthly task schedules the next one, while its journey is open.
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
      select 1 from public.journeys j where j.id = new.journey_id and j.status = 'open'
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

drop trigger if exists repeat_task on public.tasks;
create trigger repeat_task after update of status on public.tasks
  for each row execute function private.repeat_task();

revoke all on function private.sa_today(), private.client_care_tasks(), private.repeat_task() from public;
grant execute on function private.sa_today() to authenticated;

-- The board view gains the fit score (added at the end, as replace requires).
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
  j.fit_score
from public.journeys j
left join public.people p on p.id = j.person_id
left join public.organisations o on o.id = coalesce(j.organisation_id, p.organisation_id)
left join public.sources s on s.id = j.source_id
left join public.exit_reasons er on er.id = j.exit_reason_id
left join public.people rp on rp.id = j.referred_by_person_id
left join public.campaigns c on c.id = j.campaign_id;

revoke all on public.journey_overview from anon, authenticated;
grant select on public.journey_overview to authenticated;
