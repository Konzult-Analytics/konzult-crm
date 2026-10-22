-- Phase 0: workspaces and membership, with two-factor enforced by row-level security.
--
-- Rollback:
--   drop trigger if exists on_auth_user_created_bootstrap_workspace on auth.users;
--   drop table if exists public.workspace_members;
--   drop table if exists public.workspaces;
--   drop schema if exists private cascade;

-- Helpers live outside the API-exposed schemas so they can't be called over REST.
create schema if not exists private;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);

create or replace function private.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  )
$$;

revoke all on function private.is_workspace_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Every table gets this restrictive policy: no rows at all unless the session
-- passed two-factor (aal2), whatever the other policies allow.
drop policy if exists "two-factor required" on public.workspaces;
create policy "two-factor required" on public.workspaces
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "two-factor required" on public.workspace_members;
create policy "two-factor required" on public.workspace_members
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "members read their workspaces" on public.workspaces;
create policy "members read their workspaces" on public.workspaces
  for select to authenticated
  using (private.is_workspace_member(id));

drop policy if exists "members read their own membership" on public.workspace_members;
create policy "members read their own membership" on public.workspace_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Reads only from the app; workspaces and members are created by the
-- bootstrap trigger below (and, later, an owner-only invite flow).
revoke all on public.workspaces, public.workspace_members from anon, authenticated;
grant select on public.workspaces, public.workspace_members to authenticated;

-- Sign-ups are disabled, so accounts are only made in the Supabase dashboard.
-- The first account becomes owner of the Konzult workspace; later accounts get
-- nothing until an owner adds them.
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
  end if;
  return new;
end;
$$;

revoke all on function private.bootstrap_first_workspace() from public;

drop trigger if exists on_auth_user_created_bootstrap_workspace on auth.users;
create trigger on_auth_user_created_bootstrap_workspace
  after insert on auth.users
  for each row execute function private.bootstrap_first_workspace();
