-- Phase 3b fake sample data for konzult-crm-dev ONLY: two booked meetings and
-- two website enquiries in the inbox. No connection key is seeded: a key in a
-- public file would open the door to anyone. Same protections as the other
-- seed files: production seeding is disabled, and this guard refuses any
-- database without the dev-only test login.

do $$
begin
  if not exists (select 1 from auth.users where email = 'claude-test+dev@konzult.co.za') then
    raise exception 'seed-phase3b.sql is for konzult-crm-dev only (the dev test login is missing)';
  end if;
end;
$$;

do $$
declare
  ws uuid := (select id from public.workspaces order by created_at limit 1);
  p_naledi uuid := (select id from public.people where email = 'naledi@example.test' and last_name = 'Dlamini' order by created_at limit 1);
  p_riaan uuid := (select id from public.people where email = 'riaan@example.test' and last_name = 'du Toit' order by created_at limit 1);
  v_task uuid;
  v_when timestamptz;
begin
  if ws is null or exists (select 1 from public.inbound_leads where external_id = 'sample-lead-1') then
    return;
  end if;

  if p_naledi is not null then
    -- Tomorrow 10:00 South African time.
    v_when := (private.sa_today() + 1)::timestamp + interval '8 hours';
    insert into public.tasks (workspace_id, title, kind, due_on, person_id, origin)
      values (ws, 'Prepare for "Discovery call" with Naledi Dlamini', 'other', private.sa_today(), p_naledi, 'auto')
      returning id into v_task;
    insert into public.bookings (workspace_id, external_uid, event_slug, title, starts_at, ends_at, attendee_name,
        attendee_email, person_id, prep_task_id)
      values (ws, 'sample-booking-1', 'discovery-call', 'Discovery call', v_when, v_when + interval '45 minutes',
        'Naledi Dlamini', 'naledi@example.test', p_naledi, v_task);
  end if;
  if p_riaan is not null then
    v_when := (private.sa_today() + 3)::timestamp + interval '12 hours';
    insert into public.bookings (workspace_id, external_uid, event_slug, title, starts_at, ends_at, attendee_name,
        attendee_email, person_id)
      values (ws, 'sample-booking-2', 'bni-one-to-one', 'BNI one-to-one', v_when, v_when + interval '30 minutes',
        'Riaan du Toit', 'riaan@example.test', p_riaan);
  end if;

  insert into public.inbound_leads (workspace_id, external_id, name, email, phone, business, message, marketing_consent, received_at)
    values (ws, 'sample-lead-1', 'Wendy Web', 'wendy@example.test', '082 000 0201', 'Web Works (sample)',
      'We''re growing fast but cash is always tight. Could you help us see where the money goes?', true, now() - interval '3 hours');
  insert into public.inbound_leads (workspace_id, external_id, name, email, message, received_at)
    values (ws, 'sample-lead-2', 'Cheap SEO', 'seo@example.test', 'We will get you to page 1 on Google!!!', now() - interval '1 hour');
end;
$$;
