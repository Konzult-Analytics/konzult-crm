-- Phase 3c data: the "QR code" source and the "Book a time" template for
-- workspaces that already exist (new ones get them from
-- private.seed_workspace_defaults), and Konzult's Cal.com booking page with its
-- three event types. Saved settings are kept; only blanks are filled.
--
-- Rollback:
--   update public.workspace_settings set booking_page_url = null, booking_types = '[]'::jsonb;
--   delete from public.templates t where t.name = 'Book a time' and t.updated_by is null
--     and not exists (select 1 from public.interactions i where i.template_id = t.id);
--   delete from public.sources s where s.label = 'QR code'
--     and not exists (select 1 from public.journeys j where j.source_id = s.id);

select private.seed_calendar_defaults(id) from public.workspaces;

insert into public.workspace_settings (workspace_id, booking_page_url, booking_types)
select w.id, 'https://cal.com/konzult-analytics',
  '[{"slug": "discovery-call", "label": "Discovery call"},
    {"slug": "bni-one-to-one", "label": "BNI one-to-one"},
    {"slug": "next-stage-kickoff", "label": "Next Stage kickoff"}]'::jsonb
from public.workspaces w
where w.name = 'Konzult'
on conflict (workspace_id) do update
  set booking_page_url = coalesce(public.workspace_settings.booking_page_url, excluded.booking_page_url),
      booking_types = case when public.workspace_settings.booking_types = '[]'::jsonb
        then excluded.booking_types else public.workspace_settings.booking_types end;
