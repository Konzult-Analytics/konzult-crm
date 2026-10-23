-- Phase 2b: client documents and the marketing library (files in Supabase
-- Storage or links), per-person tracked links with open counts, and message
-- templates with a POPIA purpose.
--
-- Rollback:
--   drop function if exists public.share_info(text), public.share_open(text, boolean),
--     private.in_member_folder(text), private.seed_default_templates(uuid);
--   then re-run private.seed_workspace_defaults(uuid) from 20261022140000_crm_core.sql;
--   alter table public.interactions drop column if exists template_id;
--   alter table public.interactions drop constraint interactions_created_via_check,
--     add constraint interactions_created_via_check check (created_via in
--     ('manual', 'import', 'booking', 'email_bcc', 'whatsapp_export', 'voice'));
--   alter table public.proposals drop column if exists document_id;
--   drop table if exists public.asset_sends, public.templates, public.documents;
--   drop policy if exists "documents read" on storage.objects; (and "documents add",
--     "documents change", "documents remove"); delete from storage.buckets where id = 'documents'
--     (only once the bucket is empty).

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('proposal', 'contract', 'report', 'marketing', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  -- A document is either a stored file or a link (videos, podcasts, big decks).
  storage_path text check (char_length(storage_path) <= 500),
  url text check (url ~ '^https://' and char_length(url) <= 2000),
  file_name text check (char_length(file_name) <= 200),
  content_type text check (char_length(content_type) <= 120),
  size_bytes int check (size_bytes between 0 and 10485760),
  version int not null default 1 check (version >= 1),
  is_library boolean not null default false,
  service text check (char_length(service) <= 80),
  audience text check (char_length(audience) <= 80),
  notes text check (char_length(notes) <= 2000),
  person_id uuid,
  organisation_id uuid,
  journey_id uuid,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  constraint documents_file_or_link check ((storage_path is null) <> (url is null)),
  -- Library items are marketing material for anyone; client documents belong to someone.
  constraint documents_library_shape check (
    (is_library and kind = 'marketing' and person_id is null and organisation_id is null and journey_id is null)
    or (not is_library and (person_id is not null or organisation_id is not null or journey_id is not null))
  ),
  foreign key (workspace_id, person_id)
    references public.people (workspace_id, id) on delete cascade,
  foreign key (workspace_id, organisation_id)
    references public.organisations (workspace_id, id) on delete cascade,
  foreign key (workspace_id, journey_id)
    references public.journeys (workspace_id, id) on delete cascade
);

create index if not exists documents_person_idx on public.documents (person_id);
create index if not exists documents_organisation_idx on public.documents (organisation_id);
create index if not exists documents_library_idx on public.documents (workspace_id, is_library);

alter table public.proposals add column if not exists document_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'proposals_document_fkey') then
    alter table public.proposals add constraint proposals_document_fkey
      foreign key (workspace_id, document_id)
      references public.documents (workspace_id, id) on delete set null (document_id);
  end if;
end;
$$;

-- Templates (spec 11). The purpose decides the POPIA s69 rule: marketing needs
-- recorded consent or a client; personal messages are blocked only by a
-- refusal; a consent request goes once to someone whose consent is unknown.
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  purpose text not null check (purpose in ('marketing', 'personal', 'consent_request')),
  subject text check (char_length(subject) <= 200),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  unique (workspace_id, name)
);

alter table public.interactions add column if not exists template_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'interactions_template_fkey') then
    alter table public.interactions add constraint interactions_template_fkey
      foreign key (workspace_id, template_id)
      references public.templates (workspace_id, id) on delete set null (template_id);
  end if;
end;
$$;

alter table public.interactions drop constraint if exists interactions_created_via_check;
alter table public.interactions add constraint interactions_created_via_check check (
  created_via in ('manual', 'import', 'booking', 'email_bcc', 'whatsapp_export', 'voice', 'send')
);

-- One row per document sent to one person: the link they get, and its opens.
-- target_url is fixed at send time (a signed file URL valid as long as the
-- link, or the library item's own link), so the public page never needs more
-- than this row.
create table if not exists public.asset_sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default private.my_workspace_id() references public.workspaces (id) on delete cascade,
  document_id uuid not null,
  person_id uuid not null,
  journey_id uuid,
  interaction_id uuid,
  channel text not null check (channel in ('email', 'whatsapp')),
  share_token text not null unique check (share_token ~ '^[A-Za-z0-9_-]{32}$'),
  target_url text not null check (target_url ~ '^https://' and char_length(target_url) <= 4000),
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count int not null default 0,
  -- Simple per-link throttle for the public page: opens in the current hour.
  window_started_at timestamptz,
  window_opens int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (workspace_id, id),
  foreign key (workspace_id, document_id)
    references public.documents (workspace_id, id) on delete cascade,
  foreign key (workspace_id, person_id)
    references public.people (workspace_id, id) on delete cascade,
  foreign key (workspace_id, journey_id)
    references public.journeys (workspace_id, id) on delete set null (journey_id),
  foreign key (workspace_id, interaction_id)
    references public.interactions (workspace_id, id) on delete set null (interaction_id)
);

create index if not exists asset_sends_person_idx on public.asset_sends (person_id);
create index if not exists asset_sends_document_idx on public.asset_sends (document_id);

do $$
declare
  t text;
begin
  foreach t in array array['documents', 'templates', 'asset_sends'] loop
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

-- The public link page. Both run as the table owner and reveal only what the
-- page needs for one well-formed token.
create or replace function public.share_info(p_token text)
returns table (title text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then
    return;
  end if;
  return query
  select d.title,
    case
      when s.revoked_at is not null then 'revoked'
      when s.expires_at <= now() then 'expired'
      else 'ok'
    end
  from public.asset_sends s
  join public.documents d on d.id = s.document_id
  where s.share_token = p_token;
end;
$$;

-- Records an open (unless p_count is false) and hands back where to go.
-- More than 30 opens of one link within an hour are refused as 'busy'.
create or replace function public.share_open(p_token text, p_count boolean default true)
returns table (target_url text, state text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.asset_sends;
  v_fresh boolean;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then
    return;
  end if;
  select * into s from public.asset_sends a where a.share_token = p_token for update;
  if not found then
    return;
  end if;
  if s.revoked_at is not null then
    return query select null::text, 'revoked'::text;
    return;
  end if;
  if s.expires_at <= now() then
    return query select null::text, 'expired'::text;
    return;
  end if;

  v_fresh := s.window_started_at is null or s.window_started_at <= now() - interval '1 hour';
  if not v_fresh and s.window_opens >= 30 then
    return query select null::text, 'busy'::text;
    return;
  end if;

  update public.asset_sends a
  set window_started_at = case when v_fresh then now() else a.window_started_at end,
      window_opens = case when v_fresh then 1 else a.window_opens + 1 end,
      open_count = a.open_count + case when p_count then 1 else 0 end,
      first_opened_at = case when p_count then coalesce(a.first_opened_at, now()) else a.first_opened_at end,
      last_opened_at = case when p_count then now() else a.last_opened_at end
  where a.id = s.id;

  return query select s.target_url, 'ok'::text;
end;
$$;

revoke all on function public.share_info(text), public.share_open(text, boolean) from public;
grant execute on function public.share_info(text), public.share_open(text, boolean) to anon, authenticated;

-- Default templates (Zander edits them on the Library page). Merge fields:
-- {first_name}, {full_name}, {business}, {links}.
create or replace function private.seed_default_templates(ws uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.templates (workspace_id, name, purpose, subject, body, sort_order) values
    (ws, 'Thank you after a one-to-one', 'personal', 'Great to meet, {first_name}',
     E'Hi {first_name}\n\nThanks for the one-to-one. I enjoyed hearing about {business}, and I''ll keep an eye open for good introductions for you.\n\n{links}\n\nSpeak soon\nZander', 10),
    (ws, 'Visitor follow-up', 'marketing', 'Good to meet you at The Cradle, {first_name}',
     E'Hi {first_name}\n\nThanks for visiting The Cradle BNI chapter. I''m the Fractional Financial Engineer in the room: I help owner-run businesses see where the money is made and lost, and what to do about it.\n\n{links}\n\nIf it would help to chat about {business}, reply and we''ll find a time.\n\nZander\nKonzult', 20),
    (ws, 'Proposal cover note', 'personal', 'Your proposal from Konzult',
     E'Hi {first_name}\n\nThanks for your time. As discussed, here is the proposal for {business}:\n\n{links}\n\nI''m happy to walk you through it. Reply with a time that suits you.\n\nZander', 30),
    (ws, 'Client check-in', 'personal', 'Checking in',
     E'Hi {first_name}\n\nJust checking in: how are things at {business}, and is there anything you need from me this month?\n\nZander', 40),
    (ws, 'Consent request', 'consent_request', 'May I keep you posted?',
     E'Hi {first_name}\n\nMay I send you occasional updates from Konzult: practical finance insights for owner-run businesses? Reply YES and I''ll add you. If not, there''s nothing to do and I won''t send more.\n\nZander', 50)
  on conflict (workspace_id, name) do nothing;
$$;

-- New workspaces get the templates too (same defaults as 20261022140000, plus them).
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
$$;

revoke all on function private.seed_default_templates(uuid), private.seed_workspace_defaults(uuid) from public;

-- Storage: a private bucket, one folder per workspace ({workspace_id}/...).
-- Skipped where there is no storage schema (the in-memory test database).
create or replace function private.in_member_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.user_id = (select auth.uid()) and m.workspace_id::text = split_part(p_name, '/', 1)
  )
$$;

revoke all on function private.in_member_folder(text) from public;
grant execute on function private.in_member_folder(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'documents', 'documents', false, 4194304,
      array[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/png',
        'image/jpeg',
        'image/webp'
      ]
    )
    on conflict (id) do update
      set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists "documents read" on storage.objects';
    execute $p$create policy "documents read" on storage.objects for select to authenticated
      using (bucket_id = 'documents' and (select auth.jwt() ->> 'aal') = 'aal2' and private.in_member_folder(name))$p$;
    execute 'drop policy if exists "documents add" on storage.objects';
    execute $p$create policy "documents add" on storage.objects for insert to authenticated
      with check (bucket_id = 'documents' and (select auth.jwt() ->> 'aal') = 'aal2' and private.in_member_folder(name))$p$;
    execute 'drop policy if exists "documents change" on storage.objects';
    execute $p$create policy "documents change" on storage.objects for update to authenticated
      using (bucket_id = 'documents' and (select auth.jwt() ->> 'aal') = 'aal2' and private.in_member_folder(name))
      with check (bucket_id = 'documents' and (select auth.jwt() ->> 'aal') = 'aal2' and private.in_member_folder(name))$p$;
    -- Only used to clean up an upload whose database row couldn't be saved.
    execute 'drop policy if exists "documents remove" on storage.objects';
    execute $p$create policy "documents remove" on storage.objects for delete to authenticated
      using (bucket_id = 'documents' and (select auth.jwt() ->> 'aal') = 'aal2' and private.in_member_folder(name))$p$;
  end if;
end;
$$;
