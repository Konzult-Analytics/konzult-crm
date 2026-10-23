-- Phase 3c fake sample data for konzult-crm-dev ONLY: a booked meeting that
-- has already happened (so Today asks how it went) and one booked from the QR
-- code. Same protections as the other seed files: production seeding is
-- disabled, and this guard refuses any database without the dev-only test login.

do $$
begin
  if not exists (select 1 from auth.users where email = 'claude-test+dev@konzult.co.za') then
    raise exception 'seed-phase3c.sql is for konzult-crm-dev only (the dev test login is missing)';
  end if;
end;
$$;

do $$
declare
  ws uuid := (select id from public.workspaces order by created_at limit 1);
  p_thandi uuid := (select id from public.people where email = 'thandi@example.test' order by created_at limit 1);
  p_kabelo uuid := (select id from public.people where email = 'kabelo@example.test' order by created_at limit 1);
  v_when timestamptz;
begin
  if ws is null or exists (select 1 from public.bookings where external_uid = 'sample-booking-3') then
    return;
  end if;

  if p_thandi is not null then
    -- Yesterday 11:00 South African time.
    v_when := (private.sa_today() - 1)::timestamp + interval '9 hours';
    insert into public.bookings (workspace_id, external_uid, event_slug, title, starts_at, ends_at, attendee_name,
        attendee_email, person_id, source, meeting_url)
      values (ws, 'sample-booking-3', 'discovery-call', 'Discovery call', v_when, v_when + interval '45 minutes',
        'Thandi Mokoena', 'thandi@example.test', p_thandi, 'crm', 'https://app.cal.com/video/sample-room-3');
  end if;
  if p_kabelo is not null then
    v_when := (private.sa_today() + 2)::timestamp + interval '7 hours';
    insert into public.bookings (workspace_id, external_uid, event_slug, title, starts_at, ends_at, attendee_name,
        attendee_email, person_id, source)
      values (ws, 'sample-booking-4', 'discovery-call', 'Discovery call', v_when, v_when + interval '45 minutes',
        'Kabelo Mahlangu', 'kabelo@example.test', p_kabelo, 'qr');
  end if;
end;
$$;
