alter table if exists saas.projects
  add column if not exists service_key_enc text null;

alter table if exists saas.projects
  add column if not exists anon_key_enc text null;

-- Keep legacy plaintext columns for compatibility; do not delete or overwrite them here.
