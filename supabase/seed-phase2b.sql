-- Phase 2b fake sample data for konzult-crm-dev ONLY: library links, a client
-- document, and two tracked links (one opened). Files can't be seeded into
-- storage from SQL, so these are all links to example.test. Same protections
-- as the other seed files: production seeding is disabled, and this guard
-- refuses any database without the dev-only test login.

do $$
begin
  if not exists (select 1 from auth.users where email = 'claude-test+dev@konzult.co.za') then
    raise exception 'seed-phase2b.sql is for konzult-crm-dev only (the dev test login is missing)';
  end if;
end;
$$;

do $$
declare
  ws uuid := (select id from public.workspaces order by created_at limit 1);
  p_sarah uuid := (select id from public.people where email = 'sarah@example.test' and last_name = 'Nel' order by created_at limit 1);
  p_michael uuid := (select id from public.people where email = 'michael@example.test' and last_name = 'Smith' order by created_at limit 1);
  d_map uuid;
  d_podcast uuid;
begin
  if ws is null or p_sarah is null or exists (select 1 from public.documents where title = 'The Map explained (sample)') then
    return;
  end if;

  insert into public.documents (workspace_id, kind, title, url, is_library, service, audience)
    values (ws, 'marketing', 'The Map explained (sample)', 'https://example.test/the-map', true, 'The Map', 'Business owners')
    returning id into d_map;
  insert into public.documents (workspace_id, kind, title, url, is_library, service, audience)
    values (ws, 'marketing', 'FFE podcast, episode 1 (sample)', 'https://example.test/podcast-1', true, 'Fractional Financial Engineer', 'Business owners')
    returning id into d_podcast;

  insert into public.documents (workspace_id, kind, title, url, person_id)
    values (ws, 'contract', 'Engagement letter (sample)', 'https://example.test/engagement-letter', p_sarah);

  -- Opened twice by Sarah; not yet opened by Michael.
  insert into public.asset_sends (workspace_id, document_id, person_id, channel, share_token, target_url,
      sent_at, expires_at, open_count, first_opened_at, last_opened_at)
    values (ws, d_map, p_sarah, 'email', 'sampleSarahTheMapLink00000000001', 'https://example.test/the-map',
      now() - interval '20 days', now() + interval '345 days', 2, now() - interval '19 days', now() - interval '12 days');
  if p_michael is not null then
    insert into public.asset_sends (workspace_id, document_id, person_id, channel, share_token, target_url, sent_at, expires_at)
      values (ws, d_podcast, p_michael, 'whatsapp', 'sampleMichaelPodcastLink00000001', 'https://example.test/podcast-1',
        now() - interval '3 days', now() + interval '362 days');
  end if;
end;
$$;
