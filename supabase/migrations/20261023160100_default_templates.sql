-- Phase 2b data: the default message templates for workspaces that already exist
-- (new workspaces get them from private.seed_workspace_defaults).
--
-- Rollback: delete from public.templates where name in ('Thank you after a one-to-one',
--   'Visitor follow-up', 'Proposal cover note', 'Client check-in', 'Consent request')
--   and updated_by is null;

select private.seed_default_templates(id) from public.workspaces;
