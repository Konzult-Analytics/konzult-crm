-- Phase 3b fix: a booking or enquiry only matches an existing person by cell
-- number when one side has no email. Different emails on the same number (a
-- shared office line, say) are different people.
--
-- Rollback: re-run private.inbound_person from 20261023210000_inbound_bookings_leads.sql.

create or replace function private.inbound_person(p_workspace uuid, p_name text, p_email text, p_phone text, p_business text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_org uuid;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if nullif(btrim(coalesce(p_business, '')), '') is not null then
    select o.id into v_org from public.organisations o
    where o.workspace_id = p_workspace and lower(o.name) = lower(btrim(p_business));
    if v_org is null then
      insert into public.organisations (workspace_id, name) values (p_workspace, left(btrim(p_business), 160))
      returning id into v_org;
    end if;
  end if;

  if v_email is not null then
    select p.id into v_person from public.people p
    where p.workspace_id = p_workspace and lower(p.email) = v_email
    order by p.created_at limit 1;
  end if;
  if v_person is null and char_length(v_digits) = 9 then
    select p.id into v_person from public.people p
    where p.workspace_id = p_workspace
      and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = v_digits
      and (v_email is null or p.email is null)
    order by p.created_at limit 1;
  end if;

  if v_person is null then
    v_name := coalesce(v_name, split_part(coalesce(v_email, 'Unknown'), '@', 1));
    insert into public.people (workspace_id, first_name, last_name, email, phone, organisation_id)
    values (
      p_workspace,
      left(split_part(v_name, ' ', 1), 80),
      nullif(left(btrim(substr(v_name, char_length(split_part(v_name, ' ', 1)) + 1)), 80), ''),
      v_email,
      nullif(left(p_phone, 40), ''),
      v_org
    )
    returning id into v_person;
  else
    update public.people p
    set email = coalesce(p.email, v_email),
        phone = coalesce(p.phone, nullif(left(p_phone, 40), '')),
        organisation_id = coalesce(p.organisation_id, v_org)
    where p.id = v_person;
  end if;
  return v_person;
end;
$$;

revoke all on function private.inbound_person(uuid, text, text, text, text) from public;
