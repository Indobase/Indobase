-- SaaS feature tables for self-hosted multi-tenant Studio (Model A: single DB + RLS).
--
-- Adds first-class persistence for features that on Supabase Cloud are exposed via
-- the Platform API but on self-hosted previously returned empty data:
--   - saas.audit_logs                 (org / project event log)
--   - saas.custom_domains             (per-project custom hostnames)
--   - saas.third_party_auth_integrations (per-project external JWT issuers)
--
-- We also add a `ssl_enforced` flag on saas.projects so SSL enforcement toggles
-- have a real backing store (the actual TLS termination is operator-managed via
-- Traefik / load-balancer, so the value is advisory but persisted per-project).
--
-- All tables are tenant-scoped and protected with RLS (project_ref or
-- organization membership) to prevent cross-tenant reads on the shared DB.

create schema if not exists saas;

create or replace function saas.current_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.uid', true), '')::uuid,
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  )
$$;

-- ---------------------------------------------------------------------------
-- saas.projects: ssl_enforced flag (advisory in Model A)
-- ---------------------------------------------------------------------------
do $saas_features_projects$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'saas' and table_name = 'projects' and column_name = 'ssl_enforced'
  ) then
    alter table saas.projects add column ssl_enforced boolean not null default false;
  end if;
end
$saas_features_projects$;

-- physical_backups_enabled + paused_at for project lifecycle / backups UI
do $saas_features_projects_lifecycle$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'saas' and table_name = 'projects' and column_name = 'physical_backups_enabled'
  ) then
    alter table saas.projects add column physical_backups_enabled boolean not null default false;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'saas' and table_name = 'projects' and column_name = 'paused_at'
  ) then
    alter table saas.projects add column paused_at timestamptz null;
  end if;
end
$saas_features_projects_lifecycle$;

-- ---------------------------------------------------------------------------
-- saas.audit_logs
-- ---------------------------------------------------------------------------
create table if not exists saas.audit_logs (
  id bigserial primary key,
  organization_id integer null,
  project_ref text null,
  actor_gotrue_id uuid null,
  actor_email text null,
  action text not null,
  target_type text not null,
  target_description text null,
  metadata jsonb not null default '{}'::jsonb,
  ip text null,
  user_agent text null,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_logs_org_id_idx on saas.audit_logs (organization_id, occurred_at desc);
create index if not exists audit_logs_project_ref_idx on saas.audit_logs (project_ref, occurred_at desc);
create index if not exists audit_logs_actor_idx on saas.audit_logs (actor_gotrue_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- saas.custom_domains
-- ---------------------------------------------------------------------------
create table if not exists saas.custom_domains (
  id bigserial primary key,
  project_ref text not null,
  hostname text not null,
  status text not null default 'pending_verification', -- pending_verification|active|failed|disabled
  ownership_verification jsonb not null default '[]'::jsonb,
  ssl jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists custom_domains_project_hostname_idx
  on saas.custom_domains (project_ref, hostname);
create index if not exists custom_domains_hostname_idx
  on saas.custom_domains (hostname);

-- ---------------------------------------------------------------------------
-- saas.third_party_auth_integrations
-- ---------------------------------------------------------------------------
create table if not exists saas.third_party_auth_integrations (
  id bigserial primary key,
  project_ref text not null,
  type text not null, -- oidc|jwks|firebase|auth0|aws_cognito|azure_ad
  oidc_issuer_url text null,
  jwks_url text null,
  custom_jwks jsonb null,
  resolved_jwks jsonb null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists third_party_auth_project_idx
  on saas.third_party_auth_integrations (project_ref);

-- ---------------------------------------------------------------------------
-- saas.project_api_keys (publishable / secret keys for Studio API Keys UI)
-- ---------------------------------------------------------------------------
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

do $saas_features_projects_legacy_keys$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'saas' and table_name = 'projects' and column_name = 'legacy_api_keys_enabled'
  ) then
    alter table saas.projects add column legacy_api_keys_enabled boolean not null default true;
  end if;
end
$saas_features_projects_legacy_keys$;

-- ---------------------------------------------------------------------------
-- RLS: only the project's owning organization members can read/write
-- ---------------------------------------------------------------------------
-- Helper that checks org membership for the given (project_ref, gotrue_id).
create or replace function saas.is_member_of_org(_organization_id integer, _gotrue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = saas, pg_catalog
as $$
  select _gotrue_id is not null
    and exists (
      select 1 from saas.organization_members m
      where m.organization_id = _organization_id
        and m.gotrue_id = _gotrue_id
    );
$$;

create or replace function saas.has_org_role(_organization_id integer, _gotrue_id uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path = saas, pg_catalog
as $$
  select _gotrue_id is not null
    and exists (
      select 1 from saas.organization_members m
      where m.organization_id = _organization_id
        and m.gotrue_id = _gotrue_id
        and m.role = any (_roles)
    );
$$;

create or replace function saas.is_member_of_project(_project_ref text, _gotrue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = saas, pg_catalog
as $$
  select _gotrue_id is not null
    and _project_ref is not null
    and exists (
      select 1
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = _project_ref
        and m.gotrue_id = _gotrue_id
    );
$$;

-- saas.audit_logs RLS: members can read their org / project events.
alter table saas.audit_logs enable row level security;
alter table saas.audit_logs force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'saas' and tablename = 'audit_logs' and policyname = 'audit_logs_member_select') then
    create policy audit_logs_member_select on saas.audit_logs
      for select
      using (
        (organization_id is not null
          and saas.is_member_of_org(organization_id, saas.current_user_id()))
        or
        (project_ref is not null
          and saas.is_member_of_project(project_ref, saas.current_user_id()))
      );
  end if;
end
$$;

-- saas.custom_domains RLS: scoped to project membership.
alter table saas.custom_domains enable row level security;
alter table saas.custom_domains force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'saas' and tablename = 'custom_domains' and policyname = 'custom_domains_member_all') then
    create policy custom_domains_member_all on saas.custom_domains
      for all
      using (saas.is_member_of_project(project_ref, saas.current_user_id()))
      with check (saas.is_member_of_project(project_ref, saas.current_user_id()));
  end if;
end
$$;

-- saas.third_party_auth_integrations RLS.
alter table saas.third_party_auth_integrations enable row level security;
alter table saas.third_party_auth_integrations force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'saas' and tablename = 'third_party_auth_integrations' and policyname = 'third_party_auth_member_all') then
    create policy third_party_auth_member_all on saas.third_party_auth_integrations
      for all
      using (saas.is_member_of_project(project_ref, saas.current_user_id()))
      with check (saas.is_member_of_project(project_ref, saas.current_user_id()));
  end if;
end
$$;

-- saas.project_api_keys RLS.
alter table saas.project_api_keys enable row level security;
alter table saas.project_api_keys force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'saas' and tablename = 'project_api_keys' and policyname = 'project_api_keys_member_all') then
    create policy project_api_keys_member_all on saas.project_api_keys
      for all
      using (saas.is_member_of_project(project_ref, saas.current_user_id()))
      with check (saas.is_member_of_project(project_ref, saas.current_user_id()));
  end if;
end
$$;

-- Grants for service-role + authenticated paths used by Studio handlers.
revoke usage on schema saas from public;
revoke all on saas.audit_logs from public;
revoke all on saas.custom_domains from public;
revoke all on saas.third_party_auth_integrations from public;
revoke all on saas.project_api_keys from public;
revoke all on sequence saas.audit_logs_id_seq from public;
revoke all on sequence saas.custom_domains_id_seq from public;
revoke all on sequence saas.third_party_auth_integrations_id_seq from public;
grant usage on schema saas to postgres, authenticated, service_role;
grant select, insert, update, delete on saas.audit_logs to postgres, authenticated, service_role;
grant select, insert, update, delete on saas.custom_domains to postgres, authenticated, service_role;
grant select, insert, update, delete on saas.third_party_auth_integrations to postgres, authenticated, service_role;
grant select, insert, update, delete on saas.project_api_keys to postgres, authenticated, service_role;
grant usage, select on sequence saas.audit_logs_id_seq to postgres, authenticated, service_role;
grant usage, select on sequence saas.custom_domains_id_seq to postgres, authenticated, service_role;
grant usage, select on sequence saas.third_party_auth_integrations_id_seq to postgres, authenticated, service_role;
