-- Project lifecycle + backups metadata on saas.projects
alter table if exists saas.projects
  add column if not exists physical_backups_enabled boolean not null default false;

alter table if exists saas.projects
  add column if not exists paused_at timestamptz null;
