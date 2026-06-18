-- Per-project JWT signing keys + quota pause reason on projects.

create table if not exists saas.project_jwt_signing_keys (
  id uuid primary key default gen_random_uuid(),
  project_id integer not null references saas.projects(id) on delete cascade,
  algorithm text not null check (algorithm in ('EdDSA', 'ES256', 'RS256', 'HS256')),
  status text not null check (status in ('in_use', 'previously_used', 'revoked', 'standby')),
  public_jwk jsonb null,
  private_jwk_enc text null,
  is_legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_jwt_signing_keys_project_id_idx
  on saas.project_jwt_signing_keys (project_id);

create unique index if not exists project_jwt_signing_keys_one_in_use_idx
  on saas.project_jwt_signing_keys (project_id)
  where status = 'in_use';

alter table if exists saas.projects
  add column if not exists pause_reason text null;
