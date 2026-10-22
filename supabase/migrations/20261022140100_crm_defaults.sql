-- Data: default sources and exit reasons for workspaces that already exist
-- (new workspaces get them from the bootstrap trigger).
--
-- Rollback (only while no journey references them):
--   delete from public.exit_reasons; delete from public.sources;

select private.seed_workspace_defaults(id) from public.workspaces;
