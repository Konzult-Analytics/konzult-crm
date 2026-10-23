-- Phase 3a fake sample data for konzult-crm-dev ONLY: BNI referrals both ways,
-- the one-to-one target, and campaign details. Same protections as the other
-- seed files: production seeding is disabled, and this guard refuses any
-- database without the dev-only test login.

do $$
begin
  if not exists (select 1 from auth.users where email = 'claude-test+dev@konzult.co.za') then
    raise exception 'seed-phase3a.sql is for konzult-crm-dev only (the dev test login is missing)';
  end if;
end;
$$;

do $$
declare
  ws uuid := (select id from public.workspaces order by created_at limit 1);
  p_gerhard uuid := (select id from public.people where email = 'gerhard@example.test' and last_name = 'Venter' order by created_at limit 1);
  p_lindiwe uuid := (select id from public.people where email = 'lindiwe@example.test' and last_name = 'Zulu' order by created_at limit 1);
  p_johan uuid := (select id from public.people where email = 'johan@example.test' and last_name = 'Botha' order by created_at limit 1);
  p_thandi uuid := (select id from public.people where email = 'thandi@example.test' and last_name = 'Mokoena' order by created_at limit 1);
  j_johan uuid;
begin
  if ws is null or p_gerhard is null or exists (select 1 from public.referrals where notes like '%(sample)%') then
    return;
  end if;

  insert into public.workspace_settings (workspace_id, one_to_one_target, one_to_one_target_on)
    values (ws, 5, true)
    on conflict (workspace_id) do nothing;

  -- Received from Gerhard: Johan, whose client journey the referral follows.
  select id into j_johan from public.journeys where person_id = p_johan and track = 'client' order by opened_at limit 1;
  if j_johan is not null then
    insert into public.referrals (workspace_id, direction, member_person_id, contact_person_id, journey_id, referred_on,
        temperature, status, closed_value, closed_on, notes)
    select ws, 'received', p_gerhard, p_johan, j.id, current_date - 8, 4,
        case when j.stage = 'client' then 'won' when j.stage = 'prospect' then 'open' else 'contacted' end,
        case when j.stage = 'client' then j.value_estimate end,
        case when j.stage = 'client' then current_date end,
        'Wants to understand margins per route. Agreed to be contacted. (sample)'
    from public.journeys j where j.id = j_johan;
  end if;

  -- Given: one closed by the member (TYFCB), one still open.
  if p_lindiwe is not null then
    insert into public.referrals (workspace_id, direction, member_person_id, contact_name, referred_on, temperature,
        status, closed_value, closed_on, notes)
      values (ws, 'given', p_lindiwe, 'Marius Pretorius', current_date - 30, 5, 'won', 15000, current_date - 5,
        'Needed a financial plan for his practice. (sample)');
  end if;
  if p_thandi is not null then
    insert into public.referrals (workspace_id, direction, member_person_id, contact_person_id, referred_on, temperature, notes)
      values (ws, 'given', p_gerhard, p_thandi, current_date - 2, 3, 'Needs a will and a lease agreement. (sample)');
  end if;

  update public.campaigns
  set channel = 'email', started_on = current_date - 20,
      message = 'Hi {first_name}, I work with accountants whose clients need cash-flow and margin work…'
  where name = 'Accountant outreach (sample)';
  insert into public.campaigns (workspace_id, name, track, channel, started_on, notes)
    values (ws, 'BNI visitor follow-ups (sample)', 'client', 'mixed', current_date - 14, 'Every visitor gets a message within a day.');
end;
$$;
