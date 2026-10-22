-- Phase 1b: imports, campaigns and marketing consent.
--
-- Rollback:
--   drop function if exists public.import_contacts(jsonb, jsonb);
--   then re-run the journey_overview definition from 20261022140000_crm_core.sql;
--   alter table public.interactions drop column if exists campaign_id;
--   alter table public.journeys drop column if exists campaign_id;
--   drop table if exists public.campaigns, public.imports;
--   alter table public.people drop column if exists marketing_consent,
--     drop column if exists marketing_consent_at, drop column if exists marketing_consent_note;

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('bni_visitors', 'outreach', 'contact_list')),
  file_name text not null check (char_length(file_name) between 1 and 255),
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  people_created int not null default 0,
  people_updated int not null default 0,
  organisations_created int not null default 0,
  journeys_created int not null default 0,
  touches_created int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (workspace_id, id)
);

create index if not exists imports_hash_idx on public.imports (workspace_id, file_hash);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  track text not null check (track in ('client', 'partner')),
  import_id uuid,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  foreign key (workspace_id, import_id)
    references public.imports (workspace_id, id) on delete set null (import_id)
);

drop trigger if exists stamp_row on public.campaigns;
create trigger stamp_row before insert or update on public.campaigns
  for each row execute function private.stamp_row();

alter table public.journeys add column if not exists campaign_id uuid;
alter table public.interactions add column if not exists campaign_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'journeys_campaign_fkey') then
    alter table public.journeys add constraint journeys_campaign_fkey
      foreign key (workspace_id, campaign_id)
      references public.campaigns (workspace_id, id) on delete set null (campaign_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'interactions_campaign_fkey') then
    alter table public.interactions add constraint interactions_campaign_fkey
      foreign key (workspace_id, campaign_id)
      references public.campaigns (workspace_id, id) on delete set null (campaign_id);
  end if;
end;
$$;

-- POPIA s69: whether this person agreed to electronic marketing. Starts unknown.
alter table public.people
  add column if not exists marketing_consent text not null default 'unknown'
    check (marketing_consent in ('unknown', 'granted', 'refused')),
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists marketing_consent_note text check (char_length(marketing_consent_note) <= 500);

do $$
declare
  t text;
begin
  foreach t in array array['imports', 'campaigns'] loop
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

-- The board view gains the campaign name (added at the end, as replace requires).
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
  c.name as campaign
from public.journeys j
left join public.people p on p.id = j.person_id
left join public.organisations o on o.id = coalesce(j.organisation_id, p.organisation_id)
left join public.sources s on s.id = j.source_id
left join public.exit_reasons er on er.id = j.exit_reason_id
left join public.people rp on rp.id = j.referred_by_person_id
left join public.campaigns c on c.id = j.campaign_id;

revoke all on public.journey_overview from anon, authenticated;
grant select on public.journey_overview to authenticated;

-- One import in one transaction: nothing is saved unless every row is. Runs
-- with the caller's rights, so row-level security and two-factor still apply.
--
-- p_import: {kind, file_name, file_hash, campaign: {name, track} | null}
-- p_rows:   [{key, same_as?, person_id?, organisation_id?, person?, organisation?, journey?, touch?}]
--   same_as:      key of an earlier row for the same person (a repeat in the file)
--   person:       {first_name, last_name, email, phone, role_title, bni_chapter, is_bni_member, notes}
--   organisation: {name, city, industry}
--   journey:      {track, stage, source_id, referred_by_person_id?, referred_by_key?}
--   touch:        {type, direction, outcome, occurred_at, summary}
-- Rows that refer to another row by key (referred_by_key) are resolved after
-- every person exists.
create or replace function public.import_contacts(p_import jsonb, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ws uuid := private.my_workspace_id();
  v_import uuid;
  v_campaign uuid;
  v_people jsonb := '{}'::jsonb;
  v_orgs jsonb := '{}'::jsonb;
  r jsonb;
  p jsonb;
  o jsonb;
  j jsonb;
  t jsonb;
  v_person uuid;
  v_org uuid;
  v_journey uuid;
  v_touch uuid;
  v_ref uuid;
  n_people_new int := 0;
  n_people_updated int := 0;
  n_orgs_new int := 0;
  n_journeys int := 0;
  n_touches int := 0;
begin
  if v_ws is null then
    raise exception 'no workspace';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'rows must be an array of at most 5000';
  end if;

  insert into public.imports (kind, file_name, file_hash)
  values (p_import ->> 'kind', p_import ->> 'file_name', p_import ->> 'file_hash')
  returning id into v_import;

  if jsonb_typeof(p_import -> 'campaign') = 'object' then
    insert into public.campaigns (name, track, import_id)
    values (p_import -> 'campaign' ->> 'name', p_import -> 'campaign' ->> 'track', v_import)
    returning id into v_campaign;
  end if;

  -- Pass 1: every organisation and person exists.
  for r in select value from jsonb_array_elements(p_rows) loop
    v_org := null;
    v_person := null;
    o := case when jsonb_typeof(r -> 'organisation') = 'object' then r -> 'organisation' end;
    p := case when jsonb_typeof(r -> 'person') = 'object' then r -> 'person' end;

    if r ->> 'same_as' is not null then
      v_people := v_people || jsonb_build_object(r ->> 'key', v_people -> (r ->> 'same_as'));
      v_orgs := v_orgs || jsonb_build_object(r ->> 'key', v_orgs -> (r ->> 'same_as'));
      continue;
    end if;

    if r ->> 'organisation_id' is not null then
      v_org := (r ->> 'organisation_id')::uuid;
    elsif nullif(btrim(o ->> 'name'), '') is not null then
      select org.id into v_org from public.organisations org
      where org.workspace_id = v_ws and lower(org.name) = lower(btrim(o ->> 'name'));
      if v_org is null then
        insert into public.organisations (name, city, industry)
        values (btrim(o ->> 'name'), nullif(o ->> 'city', ''), nullif(o ->> 'industry', ''))
        returning id into v_org;
        n_orgs_new := n_orgs_new + 1;
      end if;
    end if;
    if v_org is not null and o is not null then
      update public.organisations set
        city = coalesce(city, nullif(o ->> 'city', '')),
        industry = coalesce(industry, nullif(o ->> 'industry', ''))
      where id = v_org and (city is null or industry is null);
    end if;

    if r ->> 'person_id' is not null then
      v_person := (r ->> 'person_id')::uuid;
      -- Existing people only gain what they're missing; nothing is overwritten.
      update public.people set
        email = coalesce(email, nullif(p ->> 'email', '')),
        phone = coalesce(phone, nullif(p ->> 'phone', '')),
        role_title = coalesce(role_title, nullif(p ->> 'role_title', '')),
        organisation_id = coalesce(organisation_id, v_org),
        bni_chapter = coalesce(bni_chapter, nullif(p ->> 'bni_chapter', '')),
        is_bni_member = is_bni_member or coalesce((p ->> 'is_bni_member')::boolean, false),
        notes = coalesce(notes, nullif(p ->> 'notes', ''))
      where id = v_person;
      if not found then
        raise exception 'person % not found', v_person;
      end if;
      n_people_updated := n_people_updated + 1;
    elsif p is not null then
      insert into public.people (first_name, last_name, email, phone, role_title, organisation_id, bni_chapter, is_bni_member, notes)
      values (
        btrim(p ->> 'first_name'),
        nullif(btrim(p ->> 'last_name'), ''),
        nullif(lower(btrim(p ->> 'email')), ''),
        nullif(btrim(p ->> 'phone'), ''),
        nullif(btrim(p ->> 'role_title'), ''),
        v_org,
        nullif(btrim(p ->> 'bni_chapter'), ''),
        coalesce((p ->> 'is_bni_member')::boolean, false),
        nullif(btrim(p ->> 'notes'), '')
      )
      returning id into v_person;
      n_people_new := n_people_new + 1;
    end if;

    v_people := v_people || jsonb_build_object(r ->> 'key', v_person);
    v_orgs := v_orgs || jsonb_build_object(r ->> 'key', v_org);
  end loop;

  -- Pass 2: journeys and touches.
  for r in select value from jsonb_array_elements(p_rows) loop
    v_person := (v_people ->> (r ->> 'key'))::uuid;
    v_org := (v_orgs ->> (r ->> 'key'))::uuid;
    v_journey := null;
    j := case when jsonb_typeof(r -> 'journey') = 'object' then r -> 'journey' end;
    t := case when jsonb_typeof(r -> 'touch') = 'object' then r -> 'touch' end;

    if j is not null and (v_person is not null or v_org is not null) then
      select jr.id into v_journey from public.journeys jr
      where jr.track = j ->> 'track' and jr.status <> 'lost'
        and (
          (v_person is not null and jr.person_id = v_person)
          or (v_person is null and jr.person_id is null and jr.organisation_id = v_org)
        )
      order by jr.opened_at
      limit 1;

      if v_journey is null then
        v_ref := coalesce(
          (j ->> 'referred_by_person_id')::uuid,
          (v_people ->> (j ->> 'referred_by_key'))::uuid
        );
        insert into public.journeys (track, person_id, organisation_id, stage, source_id, referred_by_person_id, campaign_id)
        values (
          j ->> 'track',
          v_person,
          case when v_person is null then v_org end,
          coalesce(j ->> 'stage', 'prospect'),
          (j ->> 'source_id')::uuid,
          case when v_ref is distinct from v_person then v_ref end,
          v_campaign
        )
        returning id into v_journey;
        n_journeys := n_journeys + 1;
      elsif coalesce(j ->> 'stage', 'prospect') <> 'prospect' then
        -- Forward only: a prospect moves on; anything further along stays put.
        update public.journeys set stage = j ->> 'stage'
        where id = v_journey and stage = 'prospect' and status = 'open';
      end if;
    end if;

    if t is not null and (v_person is not null or v_org is not null) then
      -- Importing the same rows again doesn't repeat their touches.
      if not exists (
        select 1 from public.interactions i
        where i.type = t ->> 'type'
          and i.occurred_at = (t ->> 'occurred_at')::timestamptz
          and coalesce(i.summary, '') = coalesce(t ->> 'summary', '')
          and (
            (v_person is not null and exists (
              select 1 from public.interaction_people ip
              where ip.interaction_id = i.id and ip.person_id = v_person
            ))
            or (v_person is null and i.organisation_id = v_org)
          )
      ) then
        insert into public.interactions (type, direction, outcome, occurred_at, summary, journey_id, organisation_id, campaign_id, created_via)
        values (
          t ->> 'type',
          nullif(t ->> 'direction', ''),
          nullif(t ->> 'outcome', ''),
          (t ->> 'occurred_at')::timestamptz,
          nullif(t ->> 'summary', ''),
          v_journey,
          v_org,
          v_campaign,
          'import'
        )
        returning id into v_touch;
        if v_person is not null then
          insert into public.interaction_people (interaction_id, person_id) values (v_touch, v_person);
        end if;
        n_touches := n_touches + 1;
      end if;
    end if;
  end loop;

  update public.imports set
    people_created = n_people_new,
    people_updated = n_people_updated,
    organisations_created = n_orgs_new,
    journeys_created = n_journeys,
    touches_created = n_touches
  where id = v_import;

  return jsonb_build_object(
    'import_id', v_import,
    'campaign_id', v_campaign,
    'people_created', n_people_new,
    'people_updated', n_people_updated,
    'organisations_created', n_orgs_new,
    'journeys_created', n_journeys,
    'touches_created', n_touches
  );
end;
$$;

revoke all on function public.import_contacts(jsonb, jsonb) from public, anon;
grant execute on function public.import_contacts(jsonb, jsonb) to authenticated;
