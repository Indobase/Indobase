-- Per-project publishable/secret API keys for Studio (self-hosted SaaS).

create table if not exists saas.project_api_keys (
  id uuid primary key default gen_random_uuid(),
  project_ref text not null,
  name text not null,
  description text null,
  type text not null check (type in ('publishable', 'secret')),
  key_hash text not null,
  key_prefix text not null,
  api_key_enc text not null,
  secret_jwt_template jsonb null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_ref, name)
);

create index if not exists project_api_keys_project_ref_idx
  on saas.project_api_keys (project_ref, inserted_at desc);

alter table if exists saas.projects
  add column if not exists legacy_api_keys_enabled boolean not null default true;

alter table saas.project_api_keys enable row level security;
alter table saas.project_api_keys force row level security;

drop policy if exists project_api_keys_member_all on saas.project_api_keys;
create policy project_api_keys_member_all on saas.project_api_keys
  for all
  using (saas.is_member_of_project(project_ref, saas.current_user_id()))
  with check (saas.is_member_of_project(project_ref, saas.current_user_id()));

revoke all on saas.project_api_keys from public;
grant select, insert, update, delete on saas.project_api_keys to postgres, authenticated, service_role;

alter table saas.project_api_keys owner to postgres;
