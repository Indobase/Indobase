-- Minimal platform API schema to support self-hosted multi-tenant CRUD.
-- This is intentionally lightweight (metadata only) so the Studio frontend
-- can manage orgs/projects without requiring a separate Platform service.

create schema if not exists platform;

-- User profile (Studio account-level data)
create table if not exists platform.profiles (
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
create table if not exists platform.organizations (
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
  on platform.organizations (owner_gotrue_id);

-- Projects (logical database instances)
create table if not exists platform.projects (
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
  service_key text not null default '',
  anon_key text not null default '',
  subscription_id text not null default '',
  -- Detail endpoint requirements
  rest_url text not null default '',
  db_host text not null default '127.0.0.1',
  -- Connection string is optional in the API schema; store for UI polling logic
  connection_string text null,
  -- Optional: if you want to persist the provided DB password, encrypt it in the app layer.
  db_pass_enc text null
);

create index if not exists projects_org_slug_idx
  on platform.projects (organization_slug);

