-- Phase 1c fake sample data for konzult-crm-dev ONLY: unanswered messages, a
-- dormant partner, a strong fit lost on our side, fit checks, stage dates for
-- Speed and weekly one-to-ones for Insights. Runs after seed.sql. It's a file of
-- its own because the CLI runs each seed file once; an edited file isn't re-run.
-- Same protections as seed.sql: production seeding is disabled, and this guard
-- refuses any database without the dev-only test login.

do $$
begin
  if not exists (select 1 from auth.users where email = 'claude-test+dev@konzult.co.za') then
    raise exception 'seed-phase1c.sql is for konzult-crm-dev only (the dev test login is missing)';
  end if;
end;
$$;

do $$
declare
  ws uuid := (select id from public.workspaces order by created_at limit 1);
  src_connect uuid;
  src_one_to_one uuid;
  r_slow uuid;
  camp uuid;
  o uuid;
  p uuid;
  j uuid;
  i uuid;
  d int;
begin
  if ws is null or exists (select 1 from public.people where email = 'una@example.test') then
    return;
  end if;

  select id into src_connect from public.sources where workspace_id = ws and label = 'BNI Connect search';
  select id into src_one_to_one from public.sources where workspace_id = ws and label = 'BNI one-to-one';
  select id into r_slow from public.exit_reasons where workspace_id = ws and label = 'Follow-up too slow or missed';
  insert into public.campaigns (workspace_id, name, track) values (ws, 'Accountant outreach (sample)', 'client') returning id into camp;

  -- Three emails without a reply: "No reply after 3 tries" on Today.
  insert into public.organisations (workspace_id, name, industry, city) values (ws, 'Fourie Bookkeeping', 'Accounting', 'Centurion') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title)
    values (ws, 'Una', 'Fourie', 'una@example.test', '082 000 0013', o, 'Owner') returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, source_id, campaign_id, opened_at, stage_changed_at)
    values (ws, 'client', p, 'contacted', src_connect, camp, now() - interval '16 days', now() - interval '15 days') returning id into j;
  foreach d in array array[15, 10, 5] loop
    insert into public.interactions (workspace_id, type, direction, outcome, occurred_at, summary, journey_id, campaign_id)
      values (ws, 'email', 'out', 'no_reply', now() - make_interval(days => d), 'Accountant outreach email.', j, camp) returning id into i;
    insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);
  end loop;

  -- Active partner last seen 120 days ago: "Partners to reconnect with".
  insert into public.organisations (workspace_id, name, industry, city) values (ws, 'Steyn Insurance Brokers', 'Insurance', 'Krugersdorp') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title, bni_chapter, is_bni_member)
    values (ws, 'Dawid', 'Steyn', 'dawid@example.test', '082 000 0014', o, 'Broker', 'The Cradle', true) returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, source_id, opened_at, stage_changed_at)
    values (ws, 'partner', p, 'active', src_one_to_one, now() - interval '200 days', now() - interval '150 days') returning id into j;
  insert into public.interactions (workspace_id, type, occurred_at, summary, journey_id, meeting_purpose, meeting_setting)
    values (ws, 'meeting', now() - interval '120 days', 'Agreed to introduce each other to new clients.', j, 'referral', 'bni_one_to_one') returning id into i;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);

  -- A strong fit lost at proposal on our side.
  insert into public.organisations (workspace_id, name, industry, city, size_band) values (ws, 'Khumalo Catering', 'Food', 'Soweto', '11-50') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title)
    values (ws, 'Lerato', 'Khumalo', 'lerato@example.test', '082 000 0015', o, 'Owner') returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, status, source_id, campaign_id, value_estimate,
      fit_need, fit_timing, fit_budget, fit_decision, exit_stage, exit_reason_id, closed_at, opened_at, stage_changed_at)
    values (ws, 'client', p, 'proposal', 'lost', src_connect, camp, 12000, 'yes', 'yes', 'yes', 'yes',
      'proposal', r_slow, now() - interval '10 days', now() - interval '70 days', now() - interval '30 days') returning id into j;
  insert into public.interactions (workspace_id, type, direction, outcome, occurred_at, summary, journey_id, campaign_id)
    values (ws, 'email', 'out', 'replied', now() - interval '60 days', 'Accountant outreach email.', j, camp) returning id into i;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);

  -- Fit checks on the earlier samples.
  update public.journeys set fit_need = 'yes', fit_timing = 'yes', fit_budget = 'maybe', fit_decision = 'yes', chance_pct = 60
    where person_id = (select id from public.people where email = 'michael@example.test');
  update public.journeys set fit_need = 'yes', fit_timing = 'yes', fit_budget = 'yes', fit_decision = 'yes'
    where person_id = (select id from public.people where email = 'sarah@example.test');
  update public.journeys set fit_need = 'no', fit_timing = 'maybe', fit_budget = 'no', fit_decision = 'yes'
    where person_id = (select id from public.people where email = 'kabelo@example.test');

  -- How Sarah's journey got to Client, for Speed.
  select id into j from public.journeys where person_id = (select id from public.people where email = 'sarah@example.test');
  insert into public.journey_stage_history (workspace_id, journey_id, from_stage, to_stage, from_status, to_status, changed_at) values
    (ws, j, null, 'prospect', null, 'open', now() - interval '90 days'),
    (ws, j, 'prospect', 'contacted', 'open', 'open', now() - interval '84 days'),
    (ws, j, 'contacted', 'meeting', 'open', 'open', now() - interval '70 days'),
    (ws, j, 'meeting', 'proposal', 'open', 'open', now() - interval '62 days');
  update public.journey_stage_history set from_stage = 'proposal', from_status = 'open', changed_at = now() - interval '40 days'
    where journey_id = j and to_stage = 'client';

  -- Earlier one-to-ones with Gerhard, for the weekly chart.
  select id into j from public.journeys where person_id = (select id from public.people where email = 'gerhard@example.test');
  select person_id into p from public.journeys where id = j;
  foreach d in array array[13, 20, 34, 41] loop
    insert into public.interactions (workspace_id, type, occurred_at, summary, journey_id, meeting_purpose, meeting_setting)
      values (ws, 'meeting', now() - make_interval(days => d), 'One-to-one catch-up.', j, 'referral', 'bni_one_to_one') returning id into i;
    insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);
  end loop;
end;
$$;
