-- SaaS metadata schema for self-hosted multi-tenant CRUD (Studio orgs/projects).
-- Lightweight metadata only so the Studio frontend can manage orgs/projects
-- without a separate hosted Platform service.

create schema if not exists saas;

-- User profile (Studio account-level data)
create table if not exists saas.profiles (
  id serial primary key,
  gotrue_id uuid not null unique,
  primary_email text not null,
  username text not null unique,
  first_name text null,
  last_name text null,
  mobile text null,
  is_alpha_user boolean not null default false,
  is_sso_user boolean not null default false,
  disabled_features text[] not null default '{}',
  free_project_limit integer null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Organizations (tenant root)
create table if not exists saas.organizations (
  id serial primary key,
  owner_gotrue_id uuid not null,
  slug text not null unique,
  name text not null,
  kind text null,
  size text null,
  plan text not null, -- free|pro|team|enterprise|platform
  opt_in_tags text[] not null default '{}',
  billing_email text null,
  billing_partner text null, -- fly|aws_marketplace|vercel_marketplace|null
  organization_missing_address boolean not null default false,
  organization_requires_mfa boolean not null default false,
  restriction_data jsonb null,
  restriction_status text null,
  usage_billing_enabled boolean not null default false,
  stripe_customer_id text null,
  subscription_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_owner_gotrue_id_idx
  on saas.organizations (owner_gotrue_id);

-- Organization membership / RBAC
create table if not exists saas.organization_members (
  organization_id integer not null,
  gotrue_id uuid not null,
  role text not null default 'owner', -- owner|admin|developer|viewer
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, gotrue_id)
);

create index if not exists organization_members_gotrue_id_idx
  on saas.organization_members (gotrue_id);

create index if not exists organization_members_org_id_idx
  on saas.organization_members (organization_id);

-- Email-based invitations (minimal)
create table if not exists saas.organization_invites (
  id bigserial primary key,
  organization_id integer not null,
  email text not null,
  role text not null default 'developer',
  token text not null unique,
  invited_by_gotrue_id uuid not null,
  accepted_at timestamptz null,
  expires_at timestamptz null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_invites_org_id_idx
  on saas.organization_invites (organization_id);

-- Projects (logical database instances)
create table if not exists saas.projects (
  id serial primary key,
  organization_id integer not null,
  organization_slug text not null,
  ref text not null unique,
  name text not null,
  cloud_provider text not null default 'localhost',
  region text not null default 'local',
  status text not null default 'ACTIVE_HEALTHY',
  inserted_at timestamptz not null default now(),
  is_branch boolean not null default false,
  preview_branch_refs text[] not null default '{}',
  -- Legacy plaintext keys (deprecated). Prefer *_enc below.
  service_key text not null default '',
  anon_key text not null default '',
  service_key_enc text null,
  anon_key_enc text null,
  subscription_id text not null default '',
  -- Detail endpoint requirements
  rest_url text not null default '',
  db_host text not null default '127.0.0.1',
  -- Data-plane: per-project stack ports (Traefik routes Host(<ref>.<domain>) to localhost:<port>).
  data_plane_port_base integer null,
  -- Connection string is optional in the API schema; store for UI polling logic
  connection_string text null,
  -- Encrypted-at-rest connection string (preferred).
  connection_string_enc text null,
  -- Optional: if you want to persist the provided DB password, encrypt it in the app layer.
  db_pass_enc text null
);

create index if not exists projects_org_slug_idx
  on saas.projects (organization_slug);

create table if not exists saas.user_notifications (
  id uuid primary key default gen_random_uuid(),
  gotrue_id uuid not null,
  name text not null,
  priority text not null default 'Info',
  status text not null default 'new',
  data jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_notifications_priority_check
    check (priority in ('Critical','Warning','Info')),
  constraint user_notifications_status_check
    check (status in ('new','seen','archived'))
);
create index if not exists user_notifications_gotrue_inserted_idx
  on saas.user_notifications (gotrue_id, inserted_at desc);
create index if not exists user_notifications_gotrue_status_idx
  on saas.user_notifications (gotrue_id, status);

create table if not exists saas.integration_connections (
  id serial primary key,
  organization_id integer not null references saas.organizations(id) on delete cascade,
  integration_slug text not null,
  connection jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, integration_slug)
);
create index if not exists integration_connections_org_idx
  on saas.integration_connections (organization_id);
