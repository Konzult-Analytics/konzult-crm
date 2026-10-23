-- Phase 2a fake sample data for konzult-crm-dev ONLY: proposals (waiting,
-- accepted, declined) and client care on Sarah Nel. Runs after the earlier
-- seed files. Same protections: production seeding is disabled, and this guard
-- refuses any database without the dev-only test login.

do $$
begin
  if not exists (select 1 from auth.users where email = 'claude-test+dev@konzult.co.za') then
    raise exception 'seed-phase2a.sql is for konzult-crm-dev only (the dev test login is missing)';
  end if;
end;
$$;

do $$
declare
  ws uuid := (select id from public.workspaces order by created_at limit 1);
  -- Matched on name as well: dev's fake import tests reused some sample emails.
  j_michael uuid := (select j.id from public.journeys j join public.people p on p.id = j.person_id
                     where p.email = 'michael@example.test' and p.last_name = 'Smith' and j.track = 'client'
                     order by j.opened_at limit 1);
  j_sarah uuid := (select j.id from public.journeys j join public.people p on p.id = j.person_id
                   where p.email = 'sarah@example.test' and p.last_name = 'Nel' and j.track = 'client'
                   order by j.opened_at limit 1);
  j_lerato uuid := (select j.id from public.journeys j join public.people p on p.id = j.person_id
                    where p.email = 'lerato@example.test' and p.last_name = 'Khumalo' and j.track = 'client'
                    order by j.opened_at limit 1);
begin
  if ws is null or j_michael is null or exists (select 1 from public.proposals where journey_id = j_michael) then
    return;
  end if;

  -- Waiting for an answer.
  insert into public.proposals (workspace_id, journey_id, title, value, sent_on, notes)
    values (ws, j_michael, 'First phase: The Map', 7500, current_date - 9, 'Sent with the cash-flow example.');

  -- Accepted: Sarah became a client.
  insert into public.proposals (workspace_id, journey_id, title, value, sent_on, status, decided_on)
    values (ws, j_sarah, 'First phase', 7500, current_date - 62, 'accepted', current_date - 40);
  update public.journeys
  set client_status = 'active', testimonial_status = 'received', referral_status = 'asked',
      testimonial_quote = 'For the first time I know which treatments actually make the practice money.'
  where id = j_sarah;

  -- Declined, before Lerato's journey was closed on our side.
  if j_lerato is not null then
    insert into public.proposals (workspace_id, journey_id, title, value, sent_on, status, decided_on)
      values (ws, j_lerato, 'First phase and monthly reporting', 12000, current_date - 35, 'declined', current_date - 30);
  end if;
end;
$$;
