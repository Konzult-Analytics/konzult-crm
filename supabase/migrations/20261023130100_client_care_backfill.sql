-- Phase 2a data: clients won before the automations existed start as Active
-- (new clients start at Onboarding) and get the client-care tasks.
--
-- Rollback (rows this migration made have no author, unlike anything done in the app):
--   delete from public.tasks
--     where origin = 'auto' and created_by is null and status = 'open'
--       and kind in ('check_in', 'payment', 'referral_ask') and created_at::date = '<date applied>';
--   update public.journeys set client_status = null where client_status = 'active' and updated_by is null;

update public.journeys
set client_status = 'active'
where track = 'client' and stage = 'client' and client_status is null;

do $$
declare
  r record;
begin
  for r in
    select id from public.journeys where track = 'client' and stage = 'client' and status = 'open'
  loop
    perform private.add_client_care_tasks(r.id, true);
  end loop;
end;
$$;
