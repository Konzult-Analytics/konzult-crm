-- Fake sample data for konzult-crm-dev ONLY. Every person and business here is
-- invented (emails at example.test, numbers 082 000 00xx). Load it with
--   supabase db push --include-seed   (while linked to dev)
-- Production can't run it: [remotes.production.db.seed] is disabled, and the
-- guard below refuses any database without the dev-only test login (Zander's
-- own login uses the same email on dev and prod, so it can't tell them apart).

do $$
begin
  if not exists (select 1 from auth.users where email = 'claude-test+dev@konzult.co.za') then
    raise exception 'seed.sql is for konzult-crm-dev only (the dev test login is missing)';
  end if;
end;
$$;

-- Claude's dev test login joins the workspace once it exists.
insert into public.workspace_members (workspace_id, user_id, role)
select w.id, u.id, 'member'
from public.workspaces w
cross join auth.users u
where u.email = 'claude-test+dev@konzult.co.za'
on conflict do nothing;

do $$
declare
  ws uuid := (select id from public.workspaces order by created_at limit 1);
  src_visitor uuid;
  src_connect uuid;
  src_referral uuid;
  src_one_to_one uuid;
  r_budget uuid;
  r_timing uuid;
  o uuid;
  p uuid;
  partner uuid;
  j uuid;
  i uuid;
begin
  if ws is null or exists (select 1 from public.people where email like '%@example.test') then
    return;
  end if;

  select id into src_visitor from public.sources where workspace_id = ws and label = 'BNI chapter visitor';
  select id into src_connect from public.sources where workspace_id = ws and label = 'BNI Connect search';
  select id into src_referral from public.sources where workspace_id = ws and label = 'Referral';
  select id into src_one_to_one from public.sources where workspace_id = ws and label = 'BNI one-to-one';
  select id into r_budget from public.exit_reasons where workspace_id = ws and label = 'No budget / too small';
  select id into r_timing from public.exit_reasons where workspace_id = ws and label = 'Bad timing';

  -- Partner: an active referral partner who introduced a client below.
  insert into public.organisations (workspace_id, name, industry, city) values (ws, 'Venter Attorneys', 'Legal', 'Krugersdorp') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title, bni_chapter, is_bni_member)
    values (ws, 'Gerhard', 'Venter', 'gerhard@example.test', '082 000 0001', o, 'Partner', 'The Cradle', true) returning id into partner;
  insert into public.journeys (workspace_id, track, person_id, stage, source_id, opened_at, stage_changed_at)
    values (ws, 'partner', partner, 'active', src_one_to_one, now() - interval '60 days', now() - interval '30 days') returning id into j;
  insert into public.interactions (workspace_id, type, occurred_at, summary, journey_id, meeting_purpose, meeting_setting)
    values (ws, 'meeting', now() - interval '6 days', 'Coffee catch-up. Agreed to swap two introductions each.', j, 'referral', 'bni_one_to_one') returning id into i;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, partner);

  -- Client prospects not contacted yet.
  insert into public.organisations (workspace_id, name, industry, city, size_band) values (ws, 'Acacia Bakery', 'Food', 'Roodepoort', '2-10') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title, birthday)
    values (ws, 'Thandi', 'Mokoena', 'thandi@example.test', '082 000 0002', o, 'Owner', (current_date + 2) - interval '38 years') returning id into p;
  insert into public.journeys (workspace_id, track, person_id, source_id, opened_at, stage_changed_at)
    values (ws, 'client', p, src_visitor, now() - interval '3 days', now() - interval '3 days');

  insert into public.organisations (workspace_id, name, industry, city) values (ws, 'Van Wyk Plumbing', 'Trades', 'Krugersdorp') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title)
    values (ws, 'Pieter', 'van Wyk', 'pieter@example.test', '082 000 0003', o, 'Owner') returning id into p;
  insert into public.journeys (workspace_id, track, person_id, source_id, opened_at, stage_changed_at)
    values (ws, 'client', p, src_connect, now() - interval '10 days', now() - interval '10 days');

  -- Contacted 20 days ago with no reply: going cold.
  insert into public.organisations (workspace_id, name, industry, city) values (ws, 'Patel Pharmacy', 'Retail', 'Florida') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title)
    values (ws, 'Ayesha', 'Patel', 'ayesha@example.test', '082 000 0004', o, 'Pharmacist') returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, source_id, opened_at, stage_changed_at)
    values (ws, 'client', p, 'contacted', src_visitor, now() - interval '25 days', now() - interval '20 days') returning id into j;
  insert into public.interactions (workspace_id, type, direction, outcome, occurred_at, summary, journey_id)
    values (ws, 'whatsapp', 'out', 'no_reply', now() - interval '20 days', 'Sent the one-pager after the chapter meeting.', j) returning id into i;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);

  -- Contacted, replied, follow-up due today; introduced by Gerhard.
  insert into public.organisations (workspace_id, name, industry, city, size_band, turnover_band) values (ws, 'Botha Logistics', 'Transport', 'Randfontein', '11-50', '5m_20m') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title)
    values (ws, 'Johan', 'Botha', 'johan@example.test', '082 000 0005', o, 'MD') returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, source_id, referred_by_person_id, opened_at, stage_changed_at)
    values (ws, 'client', p, 'contacted', src_referral, partner, now() - interval '8 days', now() - interval '3 days') returning id into j;
  insert into public.interactions (workspace_id, type, direction, outcome, occurred_at, summary, journey_id)
    values (ws, 'email', 'out', 'replied', now() - interval '3 days', 'Introduced by Gerhard. He wants to understand his margins per route.', j) returning id into i;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);
  insert into public.tasks (workspace_id, title, kind, due_on, person_id, journey_id)
    values (ws, 'Follow up with Johan Botha', 'follow_up', current_date, p, j);

  -- Meeting held; promised material is overdue.
  insert into public.organisations (workspace_id, name, industry, city) values (ws, 'Dlamini Interiors', 'Design', 'Muldersdrift') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title, bni_chapter, is_bni_member)
    values (ws, 'Naledi', 'Dlamini', 'naledi@example.test', '082 000 0006', o, 'Founder', 'The Cradle', true) returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, source_id, opened_at, stage_changed_at)
    values (ws, 'client', p, 'meeting', src_one_to_one, now() - interval '15 days', now() - interval '5 days') returning id into j;
  insert into public.interactions (workspace_id, type, occurred_at, summary, next_step, journey_id, meeting_purpose, meeting_setting)
    values (ws, 'meeting', now() - interval '5 days', 'Wants a second branch next year. Cash flow is the worry.', 'Send The Map example', j, 'sales', 'bni_one_to_one') returning id into i;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);
  insert into public.tasks (workspace_id, title, kind, due_on, person_id, journey_id)
    values (ws, 'Send The Map example', 'follow_up', current_date - 1, p, j);

  -- Proposal out.
  insert into public.organisations (workspace_id, name, industry, city, size_band) values (ws, 'Smith Engineering', 'Engineering', 'Roodepoort', '11-50') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title)
    values (ws, 'Michael', 'Smith', 'michael@example.test', '082 000 0007', o, 'Director') returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, source_id, value_estimate, opened_at, stage_changed_at)
    values (ws, 'client', p, 'proposal', src_visitor, 7500, now() - interval '30 days', now() - interval '9 days') returning id into j;
  insert into public.interactions (workspace_id, type, direction, outcome, occurred_at, summary, journey_id)
    values (ws, 'email', 'out', 'interested', now() - interval '9 days', 'Sent The Next Stage proposal, first phase R7 500.', j) returning id into i;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);
  insert into public.tasks (workspace_id, title, kind, due_on, person_id, journey_id)
    values (ws, 'Follow up on the proposal', 'follow_up', current_date + 3, p, j);

  -- A client.
  insert into public.organisations (workspace_id, name, industry, city) values (ws, 'Nel Dental', 'Healthcare', 'Krugersdorp') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title, birthday)
    values (ws, 'Sarah', 'Nel', 'sarah@example.test', '082 000 0008', o, 'Practice owner', (current_date + 5) - interval '45 years') returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, source_id, value_estimate, opened_at, stage_changed_at)
    values (ws, 'client', p, 'client', src_visitor, 7500, now() - interval '90 days', now() - interval '40 days') returning id into j;
  insert into public.interactions (workspace_id, type, occurred_at, summary, journey_id, meeting_purpose, meeting_setting)
    values (ws, 'meeting', now() - interval '30 days', 'Monthly review of the dashboard.', j, 'client_care', 'online') returning id into i;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);
  insert into public.tasks (workspace_id, title, kind, due_on, person_id, journey_id)
    values (ws, 'Monthly check-in', 'check_in', current_date + 5, p, j);

  -- Lost at the meeting stage.
  insert into public.organisations (workspace_id, name, industry, city, size_band) values (ws, 'Mahlangu Security', 'Security', 'Soweto', '2-10') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id)
    values (ws, 'Kabelo', 'Mahlangu', 'kabelo@example.test', '082 000 0009', o) returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, status, source_id, exit_stage, exit_reason_id, closed_at, opened_at, stage_changed_at)
    values (ws, 'client', p, 'meeting', 'lost', src_visitor, 'meeting', r_budget, now() - interval '12 days', now() - interval '40 days', now() - interval '20 days');

  -- Parked; the revisit date has arrived.
  insert into public.organisations (workspace_id, name, industry, city) values (ws, 'Kruger Guesthouse', 'Hospitality', 'Magaliesburg') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id)
    values (ws, 'Annelie', 'Kruger', 'annelie@example.test', '082 000 0010', o) returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, status, source_id, exit_stage, exit_reason_id, closed_at, parked_until, opened_at, stage_changed_at)
    values (ws, 'client', p, 'contacted', 'parked', src_connect, 'contacted', r_timing, now() - interval '45 days', current_date - 1, now() - interval '60 days', now() - interval '50 days');

  -- Partner contacted 16 days ago through BNI Connect: going cold.
  insert into public.organisations (workspace_id, name, industry, city) values (ws, 'Du Toit & Co', 'Accounting', 'Pretoria') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title, bni_chapter, is_bni_member)
    values (ws, 'Riaan', 'du Toit', 'riaan@example.test', '082 000 0011', o, 'Accountant', 'Elite', true) returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, source_id, opened_at, stage_changed_at)
    values (ws, 'partner', p, 'contacted', src_connect, now() - interval '18 days', now() - interval '16 days') returning id into j;
  insert into public.interactions (workspace_id, type, direction, outcome, occurred_at, summary, journey_id)
    values (ws, 'bni_message', 'out', 'no_reply', now() - interval '16 days', 'Introduced the accountant partnership idea.', j) returning id into i;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);

  -- Partner one-to-one held this week.
  insert into public.organisations (workspace_id, name, industry, city) values (ws, 'Zulu Financial Planning', 'Financial services', 'Krugersdorp') returning id into o;
  insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id, role_title, bni_chapter, is_bni_member)
    values (ws, 'Lindiwe', 'Zulu', 'lindiwe@example.test', '082 000 0012', o, 'Financial planner', 'The Cradle', true) returning id into p;
  insert into public.journeys (workspace_id, track, person_id, stage, source_id, opened_at, stage_changed_at)
    values (ws, 'partner', p, 'one_to_one', src_one_to_one, now() - interval '10 days', now() - interval '2 days') returning id into j;
  insert into public.interactions (workspace_id, type, occurred_at, summary, next_step, journey_id, meeting_purpose, meeting_setting)
    values (ws, 'meeting', now() - interval '2 days', 'GAINS: two kids, loves trail running. Her clients are small business owners.', 'Send her my referral brief', j, 'referral', 'bni_one_to_one') returning id into i;
  insert into public.interaction_people (workspace_id, interaction_id, person_id) values (ws, i, p);
end;
$$;
