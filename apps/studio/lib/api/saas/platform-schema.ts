import { executeQuery } from './query'
import { ensureSaasControlPlaneRlsApplied } from './ensureControlPlaneRls'
import { ensureSaasStudioDbPrivileges } from './ensureSaasStudioDbPrivileges'
import { ensureSaasPreventLastOwnerAllowsOrgCascade } from './preventLastOwnerTeardown'

export async function ensureSaasTables() {
  // Ensure schema exists before grants: grant_studio_access targets schema saas.
  const ensureSchema = await executeQuery({ query: 'create schema if not exists saas' })
  if (ensureSchema.error) throw ensureSchema.error

  // Apply grants before bootstrap DDL: bootstrap issues CREATE TABLE in saas; postgres needs
  // CREATE on the schema (USAGE alone is insufficient when schema is owned by supabase_admin).
  await ensureSaasStudioDbPrivileges()

  const bootstrap = await executeQuery({
    query: `
      do $saas_migration$
      begin
        if exists (select 1 from information_schema.schemata where schema_name = 'platform')
           and not exists (select 1 from information_schema.schemata where schema_name = 'saas') then
          execute 'alter schema platform rename to saas';
        end if;
      end
      $saas_migration$;

      create schema if not exists saas;
      create extension if not exists pgcrypto;

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

      create table if not exists saas.organizations (
        id serial primary key,
        owner_gotrue_id uuid not null,
        slug text not null unique,
        name text not null,
        kind text null,
        size text null,
        plan text not null,
        opt_in_tags text[] not null default '{}',
        billing_email text null,
        billing_partner text null,
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

      -- Organization membership / RBAC (SaaS isolation).
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

      -- Email-based invitations (minimal, for future UI/API expansion).
      create table if not exists saas.organization_invites (
        id bigserial primary key,
        organization_id integer not null,
        email text not null,
        role text not null default 'developer',
        token text not null unique,
        invited_by_gotrue_id uuid not null,
        accepted_at timestamptz null,
        inserted_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists organization_invites_org_id_idx
        on saas.organization_invites (organization_id);

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
        rest_url text not null default '',
        db_host text not null default '127.0.0.1',
        -- Data-plane: per-project stack ports (Traefik routes Host(<ref>.<domain>) to localhost:<port>).
        -- Convention: base + 1..N per service (rest/auth/storage/realtime/functions/etc).
        data_plane_port_base integer null,
        connection_string text null,
                    connection_string_enc text null,
        db_pass_enc text null
      );

      alter table saas.projects add column if not exists data_plane_last_provisioned_at timestamptz null;
      alter table saas.projects add column if not exists data_plane_last_provision_result jsonb null;
      alter table saas.projects add column if not exists jwt_secret_enc text null;
      alter table saas.projects add column if not exists jwt_secret_update_meta jsonb null;
      alter table saas.projects add column if not exists auth_config jsonb null;
      alter table saas.projects add column if not exists parent_project_ref text null;
      alter table saas.projects add column if not exists branch_uuid uuid not null default gen_random_uuid();
      alter table saas.projects add column if not exists branch_name text null;
      alter table saas.projects add column if not exists git_branch text null;
      alter table saas.projects add column if not exists branch_persistent boolean not null default false;
      alter table saas.projects add column if not exists branch_with_data boolean not null default false;
      alter table saas.projects add column if not exists preview_branching_enabled boolean not null default false;
      alter table saas.projects add column if not exists postgrest_config jsonb null;

      alter table saas.organizations add column if not exists razorpay_customer_id text null;
      alter table saas.organizations add column if not exists billing_pending_tier text null;
      alter table saas.organizations add column if not exists billing_provider text null;

      create index if not exists projects_org_slug_idx
        on saas.projects (organization_slug);
      create index if not exists projects_parent_project_ref_idx
        on saas.projects (parent_project_ref)
        where parent_project_ref is not null;

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
    `,
  })
  if (bootstrap.error) {
    throw bootstrap.error
  }

  const usageMetering = await executeQuery({
    query: `
      create table if not exists saas.usage_events (
        event_id uuid primary key,
        occurred_at timestamptz not null,
        project_ref text not null,
        host text null,
        method text null,
        path text null,
        status_code integer null,
        bytes_sent bigint null,
        request_time_s double precision null,
        upstream_response_time_s double precision null,
        service text null
      );

      create index if not exists usage_events_project_ref_occurred_at_idx
        on saas.usage_events (project_ref, occurred_at desc);
    `,
  })
  if (usageMetering.error) throw usageMetering.error

  await ensureSaasControlPlaneRlsApplied()
  await ensureSaasStudioDbPrivileges()
  await ensureSaasPreventLastOwnerAllowsOrgCascade()
}
