-- Encrypted-at-rest storage for tenant database connection strings.
-- The app writes `connection_string_enc` and no longer writes plaintext `connection_string`.

alter table if exists saas.projects
  add column if not exists connection_string_enc text null;

create index if not exists projects_connection_string_enc_present_idx
  on saas.projects (id)
  where connection_string_enc is not null;

