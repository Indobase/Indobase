import type { JwtPayload } from '@indobaseinc/indobase-js'

import crypto from 'node:crypto'
import { buildGotrueJwtKeysJson } from './signing-keys-gotrue'
import { executeQuery } from './query'
import { decryptString, encryptString, encryptedConnectionForPgMeta } from './util'
import { makeRandomString } from 'lib/helpers'
import { PROJECT_ENDPOINT, PROJECT_REST_URL } from 'lib/constants/api'
import type { PlanId } from 'data/subscriptions/types'

import { resolvePublicDomainForTenantStack, resolveSaaSTenantRestUrls } from './tenant-public-urls'
import {
  normalizeDataPlaneMode,
  resolveDataPlaneModeForPlan,
  resolveSharedGatewayPublicApiUrl,
} from './data-plane-mode'
import {
  tenantEdgeRuntimeMemLimit,
  tenantImgproxyDownloadBufferBytes,
  tenantImgproxyDownloadTimeoutSeconds,
  tenantPostgrestDbMaxRows,
  tenantPostgrestDbPool,
  tenantPostgrestMemLimit,
  tenantPostgrestPoolAcquisitionTimeout,
  tenantPostgrestPoolMaxIdletime,
  tenantRealtimeDbPoolSize,
  tenantRealtimeRlimitNofile,
  tenantStorageFileSizeLimitBytes,
} from './tenant-data-plane-tuning'
import {
  assertValidTenantComposeYaml,
  repairKnownTenantComposeYaml,
} from './tenant-compose-validation'
import {
  ensureTenantDatabaseBootstrapped,
  isTenantDatabaseBootstrapped,
  resolveTenantProvisionAdminUser,
  runTenantDataPlaneBootstrapFromConnectionString,
  setTenantRolePassword,
} from './provision-tenant-db'
import { recordAuditLog } from './audit'
import { ensureSaasControlPlaneRlsApplied } from './ensureControlPlaneRls'
import { ensureSaasStudioDbPrivileges } from './ensureSaasStudioDbPrivileges'
import { ensureSaasPreventLastOwnerAllowsOrgCascade } from './preventLastOwnerTeardown'
import { makeProjectJwt, resolveProjectJwtSecret } from './project-jwt'
import {
  createRazorpaySubscriptionCheckout,
  ensureRazorpayCustomer,
  isRazorpayConfigured,
} from './razorpay-billing'
import {
  computeDataPlanePortBase,
  isDataPlanePortBaseAvailable,
  resolveDataPlanePortBase,
} from './data-plane-ports'

export { computeDataPlanePortBase } from './data-plane-ports'

type PlanId = 'free' | 'pro' | 'team' | 'enterprise' | 'platform'

const PLAN_NAME: Record<PlanId, string> = {
  free: 'Starter',
  pro: 'Pro',
  team: 'Business',
  enterprise: 'Enterprise',
  platform: 'Platform',
}

const normalizePlanId = (tier?: string): PlanId => {
  // Accept either `tier_*` (from CreateOrganization) or `plan` ids (from stored rows).
  switch (tier) {
    case 'free':
    case 'pro':
    case 'team':
    case 'enterprise':
    case 'platform':
      return tier
    case 'tier_free':
      return 'free'
    case 'tier_pro':
    case 'tier_payg':
      return 'pro'
    case 'tier_team':
      return 'team'
    case 'tier_enterprise':
      return 'enterprise'
    case 'tier_platform':
      return 'platform'
    default:
      return 'free'
  }
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function uniqueSlug(base: string) {
  const clean = slugify(base)
  const suffix = makeRandomString(8).toLowerCase()
  return `${clean || 'org'}-${suffix}`
}

function uniqueProjectRef(base: string) {
  const clean = slugify(base).replace(/-/g, '')
  const suffix = makeRandomString(10).toLowerCase()
  // Keep it reasonably URL-safe/alphanumeric.
  return `${clean || 'project'}-${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

const PLATFORM_SUSPENDED_ERR =
  'This organization has been suspended by the platform team. Contact support if you need access.'

async function assertOrganizationNotPlatformSuspendedById(organizationId: number, actorId: string) {
  const r = await executeQuery<{ restriction_status: string | null }>({
    query: `select restriction_status from saas.organizations where id = $1 limit 1`,
    parameters: [organizationId],
    actorId,
  })
  if (r.error) throw r.error
  if (r.data?.[0]?.restriction_status === 'platform_suspended') {
    throw new Error(PLATFORM_SUSPENDED_ERR)
  }
}

async function assertOrganizationNotPlatformSuspendedBySlug(slug: string, actorId: string) {
  const r = await executeQuery<{ restriction_status: string | null }>({
    query: `select restriction_status from saas.organizations where slug = $1 limit 1`,
    parameters: [slug],
    actorId,
  })
  if (r.error) throw r.error
  if (r.data?.[0]?.restriction_status === 'platform_suspended') {
    throw new Error(PLATFORM_SUSPENDED_ERR)
  }
}

export type Claims = JwtPayload & Record<string, any>

function composeYamlSingleQuoted(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`
}

export function postgresJdbcUrlToEcto(jdbc: string): string {
  const t = jdbc.trim()
  if (t.startsWith('postgres://')) return `ecto://${t.slice('postgres://'.length)}`
  if (t.startsWith('postgresql://')) return `ecto://${t.slice('postgresql://'.length)}`
  return t.startsWith('ecto://') ? t : `ecto://${t}`
}

function sanitizeComposeRefToken(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_]/g, '_')
}

function buildTenantSupavisorPoolerExs(opts: { ref: string; dbHost: string; dbPort: string; dbName: string }): string {
  const { ref, dbHost, dbPort, dbName } = opts
  return `{:ok, _} = Application.ensure_all_started(:supavisor)

{:ok, version} =
  case Supavisor.Repo.query!("select version()") do
    %{rows: [[ver]]} -> Supavisor.Helpers.parse_pg_version(ver)
    _ -> nil
  end

aux_pwd = System.get_env("TENANT_POOLER_AUX_DB_PASSWORD") || ""

params = %{
  "external_id" => "${ref}",
  "db_host" => "${dbHost}",
  "db_port" => "${dbPort}",
  "db_database" => "${dbName}",
  "require_user" => false,
  "auth_query" => "SELECT * FROM pgbouncer.get_auth($1)",
  "default_max_clients" => "200",
  "default_pool_size" => "15",
  "default_parameter_status" => %{"server_version" => version},
  "users" => [%{
    "db_user" => "authenticator",
    "db_password" => aux_pwd,
    "mode_type" => "transaction",
    "pool_size" => "15",
    "is_manager" => true
  }]
}

if !Supavisor.Tenants.get_tenant_by_external_id(params["external_id"]) do
  {:ok, _} = Supavisor.Tenants.create_tenant(params)
end
`
}

function indentLinesForComposeConfig(body: string, indent: string): string {
  return body
    .split('\n')
    .map((line) => (line.length ? indent + line : line))
    .join('\n')
}

/** Same host/db as `baseUrl`, swap login role; optional `rolePassword` overrides URL password (aux split-secrets). */
export function postgresUrlWithDbRole(
  baseUrl: string,
  roleUser: string,
  rolePassword?: string
): string {
  const normalized = baseUrl.startsWith('postgres://')
    ? `postgresql://${baseUrl.slice('postgres://'.length)}`
    : baseUrl
  const u = new URL(normalized)
  const password =
    rolePassword !== undefined && rolePassword !== ''
      ? rolePassword
      : u.password
        ? decodeURIComponent(u.password)
        : ''
  u.username = encodeURIComponent(roleUser)
  u.password = encodeURIComponent(password)
  return u.toString()
}

export function getGotrueUserId(claims: Claims): string {
  // Some JWT middleware returns a wrapper like:
  //   { claims: <actual_jwt_payload> }
  // Handle that to avoid "missing gotrue user id" crashes.
  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims

  // GoTrue uses `sub` as the stable user id.
  // Depending on the GoTrue/JWT version and claim mapping, the user id can be nested.
  const id =
    normalized.sub ??
    normalized.id ??
    normalized.uid ??
    normalized.user_metadata?.sub ??
    normalized.user_metadata?.id ??
    normalized.user_metadata?.user_id ??
    normalized.user_id ??
    normalized.gotrue_id ??
    normalized.user?.id ??
    normalized.app_metadata?.sub

  if (typeof id !== 'string' || !id) {
    const keys = Object.keys(claims ?? {})
    throw new Error(`Missing gotrue user id in JWT claims (keys=${keys.join(',')})`)
  }
  return id
}

export function getPrimaryEmail(claims: Claims): string {
  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  // JWT claims typically include `email`.
  const email = normalized.email ?? normalized.user_metadata?.email ?? normalized.user_metadata?.primary_email
  if (typeof email === 'string' && email) return email
  // Fallback so the API never explodes; UI can still handle missing email.
  // Prefer any resolved gotrue id (sub/user_id/etc) over claims.sub specifically.
  const gotrueId = (() => {
    try {
      return getGotrueUserId(claims)
    } catch {
      return undefined
    }
  })()

  return gotrueId ? `${gotrueId}@localhost` : 'unknown@example.com'
}

function getUsernameFromEmail(email: string) {
  const base = email.split('@')[0]
  return slugify(base) || `user-${makeRandomString(6).toLowerCase()}`
}

let ensureSaasTablesPromise: Promise<void> | null = null

async function isSaasControlPlaneBootstrapped(): Promise<boolean> {
  const probe = await executeQuery<{ bootstrapped: boolean }>({
    query: `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'saas'
          and table_name = 'profiles'
      ) as bootstrapped
    `,
  })
  if (probe.error) throw probe.error
  return Boolean(probe.data?.[0]?.bootstrapped)
}

export async function ensureSaasTables() {
  if (!ensureSaasTablesPromise) {
    ensureSaasTablesPromise = ensureSaasTablesOnce().catch((error) => {
      ensureSaasTablesPromise = null
      throw error
    })
  }
  return ensureSaasTablesPromise
}

async function ensureSaasTablesOnce() {
  // Ensure schema exists before grants: grant_studio_access targets schema saas.
  const ensureSchema = await executeQuery({ query: 'create schema if not exists saas' })
  if (ensureSchema.error) throw ensureSchema.error

  if (await isSaasControlPlaneBootstrapped()) {
    await ensureSaasStudioDbPrivileges()
    return
  }

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
      alter table saas.projects add column if not exists storage_config jsonb null;
      alter table saas.projects add column if not exists data_plane_mode text not null default 'isolated_stack';

      alter table saas.organizations add column if not exists razorpay_customer_id text null;
      alter table saas.organizations add column if not exists billing_pending_tier text null;
      alter table saas.organizations add column if not exists billing_provider text null;

      create table if not exists saas.razorpay_webhook_events (
        event_id text primary key,
        event_name text not null,
        processed_at timestamptz not null default now()
      );

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

      create table if not exists saas.project_deployments (
        id uuid primary key default gen_random_uuid(),
        project_ref text not null references saas.projects(ref) on delete cascade,
        requested_by_gotrue_id uuid not null,
        requested_via text not null default 'studio',
        status text not null default 'requested',
        target_url text not null,
        custom_domain_hostname text null,
        logs jsonb not null default '[]'::jsonb,
        metadata jsonb not null default '{}'::jsonb,
        inserted_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        completed_at timestamptz null,
        last_error text null,
        constraint project_deployments_requested_via_check
          check (requested_via in ('studio', 'builder', 'api')),
        constraint project_deployments_status_check
          check (status in ('requested', 'building', 'ready', 'failed', 'archived'))
      );
      alter table saas.project_deployments add column if not exists logs jsonb not null default '[]'::jsonb;
      create index if not exists project_deployments_project_ref_inserted_idx
        on saas.project_deployments (project_ref, inserted_at desc);

      create table if not exists saas.project_edge_function_secrets (
        id uuid primary key default gen_random_uuid(),
        project_ref text not null references saas.projects(ref) on delete cascade,
        name text not null,
        value_enc text not null,
        inserted_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (project_ref, name)
      );
      create index if not exists project_edge_function_secrets_project_ref_idx
        on saas.project_edge_function_secrets (project_ref);

      create table if not exists saas.project_mobile_builds (
        id uuid primary key default gen_random_uuid(),
        project_ref text not null references saas.projects(ref) on delete cascade,
        requested_by_gotrue_id uuid not null,
        requested_via text not null default 'studio',
        status text not null default 'requested',
        priority text not null default 'standard',
        target text not null default 'android_aab',
        framework text not null default 'expo',
        profile text not null default 'production',
        logs jsonb not null default '[]'::jsonb,
        metadata jsonb not null default '{}'::jsonb,
        inserted_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        completed_at timestamptz null,
        last_error text null,
        constraint project_mobile_builds_requested_via_check
          check (requested_via in ('studio', 'builder', 'api')),
        constraint project_mobile_builds_status_check
          check (status in ('requested', 'building', 'ready', 'failed', 'archived')),
        constraint project_mobile_builds_priority_check
          check (priority in ('standard', 'priority')),
        constraint project_mobile_builds_target_check
          check (target in ('android_aab')),
        constraint project_mobile_builds_framework_check
          check (framework in ('expo', 'react_native', 'flutter', 'other')),
        constraint project_mobile_builds_profile_check
          check (profile in ('production', 'preview'))
      );
      alter table saas.project_mobile_builds add column if not exists logs jsonb not null default '[]'::jsonb;
      alter table saas.project_mobile_builds add column if not exists priority text not null default 'standard';
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = 'project_mobile_builds_priority_check'
            and conrelid = 'saas.project_mobile_builds'::regclass
        ) then
          alter table saas.project_mobile_builds
            add constraint project_mobile_builds_priority_check
            check (priority in ('standard', 'priority'));
        end if;
      end
      $$;
      create index if not exists project_mobile_builds_project_ref_inserted_idx
        on saas.project_mobile_builds (project_ref, inserted_at desc);
      create index if not exists project_mobile_builds_project_ref_status_idx
        on saas.project_mobile_builds (project_ref, status);
      create index if not exists project_mobile_builds_claim_idx
        on saas.project_mobile_builds (status, priority, inserted_at asc);
      create unique index if not exists project_mobile_builds_one_active_per_project_idx
        on saas.project_mobile_builds (project_ref)
        where status in ('requested', 'building');

      create table if not exists saas.project_mobile_build_artifacts (
        id uuid primary key default gen_random_uuid(),
        build_id uuid not null references saas.project_mobile_builds(id) on delete cascade,
        kind text not null default 'android_aab',
        file_name text not null,
        mime_type text null,
        size_bytes bigint null,
        checksum_sha256 text null,
        download_url text not null,
        metadata jsonb not null default '{}'::jsonb,
        inserted_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint project_mobile_build_artifacts_kind_check
          check (kind in ('android_aab', 'mapping', 'manifest', 'other'))
      );
      create index if not exists project_mobile_build_artifacts_build_id_idx
        on saas.project_mobile_build_artifacts (build_id, inserted_at desc);
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

export async function getOrCreateProfile(claims: Claims) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const email = getPrimaryEmail(claims)
  const username = getUsernameFromEmail(email)

  // Try fetch first; if missing create.
  const existing = await executeQuery<{
    id: number
    gotrue_id: string
    primary_email: string
    username: string
    first_name: string | null
    last_name: string | null
    mobile: string | null
    is_alpha_user: boolean
    is_sso_user: boolean
    disabled_features: string[]
    free_project_limit: number | null
  }>({
    query:
      'select id, gotrue_id, primary_email, username, first_name, last_name, mobile, is_alpha_user, is_sso_user, disabled_features, free_project_limit from saas.profiles where gotrue_id = $1',
    parameters: [gotrueId],
    actorId: gotrueId,
  })

  if (!existing.error && existing.data?.length) {
    const row = existing.data[0]
    return {
      id: row.id,
      gotrue_id: row.gotrue_id,
      auth0_id: row.gotrue_id,
      primary_email: row.primary_email,
      username: row.username,
      first_name: row.first_name,
      last_name: row.last_name,
      mobile: row.mobile,
      is_alpha_user: row.is_alpha_user,
      is_sso_user: row.is_sso_user,
      disabled_features: row.disabled_features,
      free_project_limit: row.free_project_limit,
    }
  }

  const insert = await executeQuery<{
    id: number
    gotrue_id: string
    primary_email: string
    username: string
    first_name: string | null
    last_name: string | null
    mobile: string | null
    is_alpha_user: boolean
    is_sso_user: boolean
    disabled_features: string[]
    free_project_limit: number | null
  }>({
    query: `
      insert into saas.profiles
        (gotrue_id, primary_email, username, first_name, last_name, mobile)
      values
        ($1, $2, $3, null, null, null)
      returning id, gotrue_id, primary_email, username, first_name, last_name, mobile, is_alpha_user, is_sso_user, disabled_features, free_project_limit
    `,
    parameters: [gotrueId, email, username],
    actorId: gotrueId,
  })

  if (insert.error || !insert.data?.length) {
    throw insert.error ?? new Error('Failed to create profile')
  }

  const row = insert.data[0]
  return {
    id: row.id,
    gotrue_id: row.gotrue_id,
    auth0_id: row.gotrue_id,
    primary_email: row.primary_email,
    username: row.username,
    first_name: row.first_name,
    last_name: row.last_name,
    mobile: row.mobile,
    is_alpha_user: row.is_alpha_user,
    is_sso_user: row.is_sso_user,
    disabled_features: row.disabled_features,
    free_project_limit: row.free_project_limit,
  }
}

export async function getProfile(claims: Claims) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const profile = await executeQuery<{
    id: number
    gotrue_id: string
    primary_email: string
    username: string
    first_name: string | null
    last_name: string | null
    mobile: string | null
    is_alpha_user: boolean
    is_sso_user: boolean
    disabled_features: string[]
    free_project_limit: number | null
  }>({
    query:
      'select id, gotrue_id, primary_email, username, first_name, last_name, mobile, is_alpha_user, is_sso_user, disabled_features, free_project_limit from saas.profiles where gotrue_id = $1',
    parameters: [gotrueId],
    actorId: gotrueId,
  })

  if (profile.error) throw profile.error
  if (!profile.data?.length) return null

  const row = profile.data[0]
  return {
    id: row.id,
    gotrue_id: row.gotrue_id,
    auth0_id: row.gotrue_id,
    primary_email: row.primary_email,
    username: row.username,
    first_name: row.first_name,
    last_name: row.last_name,
    mobile: row.mobile,
    is_alpha_user: row.is_alpha_user,
    is_sso_user: row.is_sso_user,
    disabled_features: row.disabled_features,
    free_project_limit: row.free_project_limit,
  }
}

export async function updateProfile({
  claims,
  updates,
}: {
  claims: Claims
  updates: { username?: string; first_name?: string; last_name?: string; primary_email?: string }
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const { username, first_name, last_name, primary_email } = updates

  const updated = await executeQuery<{
    id: number
    gotrue_id: string
    primary_email: string
    username: string
    first_name: string | null
    last_name: string | null
    mobile: string | null
    is_alpha_user: boolean
    is_sso_user: boolean
    disabled_features: string[]
    free_project_limit: number | null
  }>({
    query: `
      update saas.profiles
      set
        username = coalesce($1, username),
        first_name = coalesce($2, first_name),
        last_name = coalesce($3, last_name),
        primary_email = coalesce($4, primary_email),
        updated_at = now()
      where gotrue_id = $5
      returning id, gotrue_id, primary_email, username, first_name, last_name, mobile, is_alpha_user, is_sso_user, disabled_features, free_project_limit
    `,
    parameters: [username ?? null, first_name ?? null, last_name ?? null, primary_email ?? null, gotrueId],
    actorId: gotrueId,
  })

  if (updated.error || !updated.data?.length) throw updated.error ?? new Error('Failed to update profile')
  const row = updated.data[0]

  return {
    id: row.id,
    gotrue_id: row.gotrue_id,
    auth0_id: row.gotrue_id,
    primary_email: row.primary_email,
    username: row.username,
    first_name: row.first_name,
    last_name: row.last_name,
    mobile: row.mobile,
    is_alpha_user: row.is_alpha_user,
    is_sso_user: row.is_sso_user,
    disabled_features: row.disabled_features,
    free_project_limit: row.free_project_limit,
  }
}

export async function listOrganizations({
  claims,
  limit,
  offset,
}: {
  claims: Claims
  limit?: number
  offset?: number
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const qLimit = Math.min(Math.max(limit ?? 100, 1), 200)
  const qOffset = Math.max(offset ?? 0, 0)

  const rows = await executeQuery<{
    id: number
    slug: string
    name: string
    kind: string | null
    billing_email: string | null
    billing_partner: string | null
    plan: string
    opt_in_tags: string[]
    organization_missing_address: boolean
    organization_requires_mfa: boolean
    restriction_data: any
    restriction_status: string | null
    usage_billing_enabled: boolean
    stripe_customer_id: string | null
    subscription_id: string | null
    member_role: string
  }>({
    query: `
      select
        o.id,
        o.slug,
        o.name,
        o.kind,
        o.billing_email,
        o.billing_partner,
        o.plan,
        o.opt_in_tags,
        o.organization_missing_address,
        o.organization_requires_mfa,
        o.restriction_data,
        o.restriction_status,
        o.usage_billing_enabled,
        o.stripe_customer_id,
        o.subscription_id,
        m.role as member_role
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where m.gotrue_id = $1
      order by o.name asc
      limit $2 offset $3
    `,
    parameters: [gotrueId, qLimit, qOffset],
    actorId: gotrueId,
  })

  if (rows.error) throw rows.error

  return (rows.data ?? []).map((o) => {
    const planId = normalizePlanId(o.plan)
    return {
      id: o.id,
      slug: o.slug,
      name: o.name,
      kind: o.kind,
      billing_email: o.billing_email,
      billing_partner: (o.billing_partner as any) ?? null,
      is_owner: o.member_role === 'owner',
      plan: { id: planId, name: PLAN_NAME[planId] },
      opt_in_tags: o.opt_in_tags ?? [],
      organization_missing_address: o.organization_missing_address,
      organization_requires_mfa: o.organization_requires_mfa,
      restriction_data: o.restriction_data ?? null,
      restriction_status: (o.restriction_status as any) ?? null,
      usage_billing_enabled: o.usage_billing_enabled,
      stripe_customer_id: o.stripe_customer_id,
      subscription_id: o.subscription_id,
    }
  })
}

export async function listOrganizationsWithRoles({ claims }: { claims: Claims }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{ slug: string; role: string }>({
    query: `
      select o.slug, m.role
      from saas.organization_members m
      join saas.organizations o on o.id = m.organization_id
      where m.gotrue_id = $1
      order by o.slug
    `,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data ?? []
}

export async function getOrganizationBillingView({
  claims,
  slug,
}: {
  claims: Claims
  slug: string
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    plan: string
    usage_billing_enabled: boolean
    stripe_customer_id: string | null
    subscription_id: string | null
    billing_partner: string | null
    billing_provider: string | null
    razorpay_customer_id: string | null
  }>({
    query: `
      select o.plan, o.usage_billing_enabled, o.stripe_customer_id, o.subscription_id,
        o.billing_partner, o.billing_provider, o.razorpay_customer_id
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  if (!row) return null
  const planId = normalizePlanId(row.plan)
  return {
    plan: { id: planId, name: PLAN_NAME[planId] },
    usage_billing_enabled: row.usage_billing_enabled,
    stripe_customer_id: row.stripe_customer_id,
    subscription_id: row.subscription_id,
    billing_partner: row.billing_partner ?? null,
    billing_provider: row.billing_provider ?? null,
    razorpay_customer_id: row.razorpay_customer_id,
  }
}

export async function listIntegrationRowsForOrganization({
  claims,
  orgSlug,
}: {
  claims: Claims
  orgSlug: string
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    id: number
    integration_slug: string
    connection: Record<string, unknown>
    inserted_at: string
    updated_at: string
  }>({
    query: `
      select ic.id, ic.integration_slug, ic.connection, ic.inserted_at::text, ic.updated_at::text
      from saas.integration_connections ic
      join saas.organizations o on o.id = ic.organization_id
      where o.slug = $1
        and exists (
          select 1 from saas.organization_members m
          where m.organization_id = o.id and m.gotrue_id = $2
        )
      order by ic.integration_slug
    `,
    parameters: [orgSlug, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data ?? []
}

export async function listOrganizationMembers({ claims, slug }: { claims: Claims; slug: string }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const rows = await executeQuery<{
    gotrue_id: string
    role: string
    inserted_at: string
  }>({
    query: `
      select
        m.gotrue_id,
        m.role,
        m.inserted_at
      from saas.organization_members m
      join saas.organizations o on o.id = m.organization_id
      where o.slug = $1
        and exists (
          select 1
          from saas.organization_members me
          where me.organization_id = o.id
            and me.gotrue_id = $2
        )
      order by m.inserted_at asc
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data ?? []
}

export async function addOrganizationMember({
  claims,
  slug,
  member_gotrue_id,
  role,
}: {
  claims: Claims
  slug: string
  member_gotrue_id: string
  role: 'owner' | 'admin' | 'developer' | 'viewer'
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const org = await executeQuery<{ id: number }>({
    query: `
      select o.id
      from saas.organizations o
      join saas.organization_members me on me.organization_id = o.id
      where o.slug = $1
        and me.gotrue_id = $2
        and me.role in ('owner','admin')
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (org.error) throw org.error
  if (!org.data?.length) throw new Error('Organization not found or insufficient permissions')

  const inserted = await executeQuery({
    query: `
      insert into saas.organization_members (organization_id, gotrue_id, role)
      values ($1, $2, $3)
      on conflict (organization_id, gotrue_id) do update
        set role = excluded.role,
            updated_at = now()
    `,
    parameters: [org.data[0].id, member_gotrue_id, role],
    actorId: gotrueId,
  })
  if (inserted.error) throw inserted.error

  await recordAuditLog({
    claims,
    organizationId: org.data[0].id,
    action: 'org.member.added',
    targetType: 'user',
    targetDescription: member_gotrue_id,
    metadata: { role, member_gotrue_id },
  })

  return true
}

export async function removeOrganizationMember({
  claims,
  slug,
  member_gotrue_id,
}: {
  claims: Claims
  slug: string
  member_gotrue_id: string
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const del = await executeQuery({
    query: `
      delete from saas.organization_members m
      using saas.organizations o
      where o.id = m.organization_id
        and o.slug = $1
        and m.gotrue_id = $2
        and exists (
          select 1
          from saas.organization_members me
          where me.organization_id = o.id
            and me.gotrue_id = $3
            and me.role = 'owner'
        )
        and not (m.gotrue_id = $3 and m.role = 'owner')
    `,
    parameters: [slug, member_gotrue_id, gotrueId],
    actorId: gotrueId,
  })
  if (del.error) throw del.error

  // Best-effort: capture the org id for audit metadata (membership delete returns
  // no rows, so look it up after the fact via a non-RLS-restricted query).
  const orgLookup = await executeQuery<{ id: number }>({
    query: `select id from saas.organizations where slug = $1 limit 1`,
    parameters: [slug],
    actorId: gotrueId,
  })
  await recordAuditLog({
    claims,
    organizationId: orgLookup.data?.[0]?.id ?? null,
    action: 'org.member.removed',
    targetType: 'user',
    targetDescription: member_gotrue_id,
    metadata: { member_gotrue_id, slug },
  })

  return true
}

export async function listOrganizationInvites({ claims, slug }: { claims: Claims; slug: string }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const rows = await executeQuery<{
    id: string
    email: string
    role: string
    token: string
    invited_by_gotrue_id: string
    accepted_at: string | null
    inserted_at: string
  }>({
    query: `
      select
        i.id::text,
        i.email,
        i.role,
        i.token,
        i.invited_by_gotrue_id::text,
        i.accepted_at,
        i.inserted_at
      from saas.organization_invites i
      join saas.organizations o on o.id = i.organization_id
      where o.slug = $1
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = o.id
            and m.gotrue_id = $2
        )
      order by i.inserted_at desc
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data ?? []
}

export async function createOrganizationInvite({
  claims,
  slug,
  email,
  role,
}: {
  claims: Claims
  slug: string
  email: string
  role: 'admin' | 'developer' | 'viewer'
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  await assertOrganizationNotPlatformSuspendedBySlug(slug, gotrueId)

  const org = await executeQuery<{ id: number }>({
    query: `
      select o.id
      from saas.organizations o
      join saas.organization_members me on me.organization_id = o.id
      where o.slug = $1
        and me.gotrue_id = $2
        and me.role in ('owner','admin')
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (org.error) throw org.error
  if (!org.data?.length) throw new Error('Organization not found or insufficient permissions')

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) throw new Error('Email is required')

  const token = makeRandomString(48)

  const inserted = await executeQuery<{
    id: string
    email: string
    role: string
    token: string
    accepted_at: string | null
    inserted_at: string
  }>({
    query: `
      insert into saas.organization_invites (
        organization_id,
        email,
        role,
        token,
        invited_by_gotrue_id,
        expires_at
      ) values ($1, $2, $3, $4, $5, now() + interval '7 days')
      returning id::text, email, role, token, accepted_at, inserted_at
    `,
    parameters: [org.data[0].id, normalizedEmail, role, token, gotrueId],
    actorId: gotrueId,
  })
  if (inserted.error || !inserted.data?.length) throw inserted.error ?? new Error('Failed to create invite')
  return inserted.data[0]
}

export async function acceptOrganizationInvite({ claims, token }: { claims: Claims; token: string }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const email = getPrimaryEmail(claims).trim().toLowerCase()
  const cleanToken = token.trim()
  if (!cleanToken) throw new Error('Invite token is required')

  const invite = await executeQuery<{
    organization_id: number
    role: string
    email: string
    accepted_at: string | null
    expires_at: string | null
  }>({
    query: `
      select organization_id, role, email, accepted_at, expires_at
      from saas.organization_invites
      where token = $1
      limit 1
    `,
    parameters: [cleanToken],
    actorId: gotrueId,
  })
  if (invite.error) throw invite.error
  if (!invite.data?.length) throw new Error('Invite not found')
  const row = invite.data[0]
  if (row.accepted_at) throw new Error('Invite already accepted')
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    throw new Error('Invite expired')
  }
  if (row.email.trim().toLowerCase() !== email) {
    throw new Error('Invite email does not match the signed-in account')
  }

  await assertOrganizationNotPlatformSuspendedById(row.organization_id, gotrueId)

  const tx = await executeQuery({
    query: `
      with updated as (
        update saas.organization_invites
        set accepted_at = now(), updated_at = now()
        where token = $1
          and accepted_at is null
          and (expires_at is null or expires_at > now())
        returning organization_id, role
      )
      insert into saas.organization_members (organization_id, gotrue_id, role)
      select organization_id, $2::uuid, role
      from updated
      on conflict (organization_id, gotrue_id) do update
        set role = excluded.role,
            updated_at = now()
    `,
    parameters: [cleanToken, gotrueId],
    actorId: gotrueId,
  })
  if (tx.error) throw tx.error
  return true
}

export async function getOrganization({ claims, slug }: { claims: Claims; slug: string }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const rows = await executeQuery<{
    id: number
    slug: string
    name: string
    billing_email: string | null
    billing_partner: string | null
    plan: string
    opt_in_tags: string[]
    organization_missing_address: boolean
    organization_requires_mfa: boolean
    restriction_data: any
    restriction_status: string | null
    usage_billing_enabled: boolean
    stripe_customer_id: string | null
    subscription_id: string | null
    member_role: string
  }>({
    query: `
      select
        id,
        slug,
        name,
        billing_email,
        billing_partner,
        plan,
        opt_in_tags,
        organization_missing_address,
        organization_requires_mfa,
        restriction_data,
        restriction_status,
        usage_billing_enabled,
        stripe_customer_id,
        subscription_id
      , m.role as member_role
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })

  if (rows.error) throw rows.error
  if (!rows.data?.length) return null

  const o = rows.data[0]
  const planId = normalizePlanId(o.plan)

  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    billing_email: o.billing_email,
    billing_partner: (o.billing_partner as any) ?? null,
    plan: { id: planId, name: PLAN_NAME[planId] },
    opt_in_tags: o.opt_in_tags ?? [],
    restriction_data: o.restriction_data ?? null,
    restriction_status: (o.restriction_status as any) ?? null,
    usage_billing_enabled: o.usage_billing_enabled,
    has_oriole_project: false,
  }
}

export async function createOrganization({
  claims,
  body,
}: {
  claims: Claims
  body: {
    name: string
    kind?: string
    size?: string
    tier?: string
    payment_method?: string
    billing_name?: string | null
    address?: unknown
    tax_id?: unknown
  }
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const email = getPrimaryEmail(claims)

  const name = (body.name ?? '').toString().trim()
  if (!name) throw new Error('Organization name is required')

  const orgKind = (body.kind ?? 'PERSONAL').toString().trim().toUpperCase()
  if (orgKind === 'PERSONAL') {
    const existingPersonal = await executeQuery<{ id: number }>({
      query: `
        select id
        from saas.organizations
        where owner_gotrue_id = $1 and kind = 'PERSONAL'
        limit 1
      `,
      parameters: [gotrueId],
      actorId: gotrueId,
    })
    if (existingPersonal.error) throw existingPersonal.error
    if (existingPersonal.data?.length) {
      throw new Error(
        'You already have a personal organization. Choose another type or use your existing org.'
      )
    }
  }

  const requestedPlanId = normalizePlanId(body.tier)
  const slug = uniqueSlug(name)
  const useRazorpayCheckout = isRazorpayConfigured() && requestedPlanId !== 'free'
  const initialPlanId = useRazorpayCheckout ? 'free' : requestedPlanId

  const inserted = await executeQuery<{
    id: number
    slug: string
    name: string
    billing_email: string | null
    billing_partner: string | null
    plan: string
    opt_in_tags: string[]
    organization_missing_address: boolean
    organization_requires_mfa: boolean
    restriction_data: any
    restriction_status: string | null
    usage_billing_enabled: boolean
    stripe_customer_id: string | null
    subscription_id: string | null
  }>({
    query: `
      insert into saas.organizations (
        owner_gotrue_id,
        slug,
        name,
        kind,
        size,
        plan,
        opt_in_tags,
        billing_email,
        billing_partner,
        organization_missing_address,
        organization_requires_mfa,
        restriction_data,
        restriction_status,
        usage_billing_enabled,
        stripe_customer_id,
        subscription_id
      ) values (
        $1, $2, $3, $4, $5, $6,
        '{}',
        coalesce($7, $8),
        null,
        false,
        false,
        null,
        null,
        false,
        null,
        null
      )
      returning
        id, slug, name, billing_email, billing_partner, plan, opt_in_tags,
        organization_missing_address, organization_requires_mfa, restriction_data,
        restriction_status, usage_billing_enabled, stripe_customer_id, subscription_id
    `,
    parameters: [
      gotrueId,
      slug,
      name,
      body.kind ?? null,
      body.size ?? null,
      initialPlanId,
      body.billing_name ?? null,
      email,
    ],
    actorId: gotrueId,
  })

  if (inserted.error) {
    const code = String((inserted.error as { code?: string | number }).code ?? '')
    if (code === '23505' && orgKind === 'PERSONAL') {
      throw new Error(
        'You already have a personal organization. Choose another type or use your existing org.'
      )
    }
    throw inserted.error
  }
  if (!inserted.data?.length) throw new Error('Failed to create organization')
  const o = inserted.data[0]

  // Seed membership for the creator so SaaS authorization is membership-based, not owner-column-based.
  const memberInsert = await executeQuery({
    query: `
      insert into saas.organization_members (organization_id, gotrue_id, role)
      values ($1, $2, 'owner')
      on conflict (organization_id, gotrue_id) do update
        set role = excluded.role,
            updated_at = now()
    `,
    parameters: [o.id, gotrueId],
    actorId: gotrueId,
  })
  if (memberInsert.error) throw memberInsert.error

  await recordAuditLog({
    claims,
    organizationId: o.id,
    action: 'org.create',
    targetType: 'organization',
    targetDescription: `Organization "${o.name}" (${o.slug})`,
    metadata: { plan: requestedPlanId, billing_pending: useRazorpayCheckout },
  })

  let pendingCheckoutUrl: string | undefined
  if (useRazorpayCheckout) {
    const customerId = await ensureRazorpayCustomer({
      organizationId: o.id,
      orgSlug: o.slug,
      orgName: o.name,
      email: o.billing_email ?? email,
    })
    const checkout = await createRazorpaySubscriptionCheckout({
      organizationId: o.id,
      orgSlug: o.slug,
      planId: requestedPlanId,
      customerId,
    })
    pendingCheckoutUrl = checkout.checkoutUrl
  }

  const responsePlanId = useRazorpayCheckout ? 'free' : requestedPlanId

  return {
    billing_email: o.billing_email,
    billing_partner: (o.billing_partner as any) ?? null,
    id: o.id,
    is_owner: true,
    name: o.name,
    opt_in_tags: o.opt_in_tags ?? [],
    organization_missing_address: o.organization_missing_address,
    organization_requires_mfa: o.organization_requires_mfa,
    plan: { id: responsePlanId, name: PLAN_NAME[responsePlanId] },
    restriction_data: o.restriction_data ?? null,
    restriction_status: (o.restriction_status as any) ?? null,
    slug: o.slug,
    stripe_customer_id: o.stripe_customer_id,
    subscription_id: o.subscription_id,
    usage_billing_enabled: o.usage_billing_enabled,
    ...(pendingCheckoutUrl
      ? {
          provider: 'razorpay' as const,
          pending_checkout_url: pendingCheckoutUrl,
        }
      : {}),
  }
}

export async function updateOrganization({
  claims,
  slug,
  updates,
}: {
  claims: Claims
  slug: string
  updates: { name?: string; billing_email?: string; opt_in_tags?: string[]; additional_billing_emails?: string[] }
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  await assertOrganizationNotPlatformSuspendedBySlug(slug, gotrueId)

  const updated = await executeQuery<{
    id: number
    slug: string
    name: string
    billing_email: string | null
    opt_in_tags: string[]
    stripe_customer_id: string | null
  }>({
    query: `
      update saas.organizations
      set
        name = coalesce($1, name),
        billing_email = coalesce($2, billing_email),
        opt_in_tags = coalesce($3, opt_in_tags),
        updated_at = now()
      where slug = $4
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = saas.organizations.id
            and m.gotrue_id = $5
            and m.role in ('owner', 'admin')
        )
      returning id, slug, name, billing_email, opt_in_tags, stripe_customer_id
    `,
    parameters: [updates.name ?? null, updates.billing_email ?? null, updates.opt_in_tags ?? null, slug, gotrueId],
    actorId: gotrueId,
  })

  if (updated.error) throw updated.error
  if (!updated.data?.length) return null

  const o = updated.data[0]

  await recordAuditLog({
    claims,
    organizationId: o.id,
    action: 'org.update',
    targetType: 'organization',
    targetDescription: `Organization "${o.name}" (${o.slug})`,
    metadata: {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.billing_email !== undefined && { billing_email: updates.billing_email }),
      ...(updates.opt_in_tags !== undefined && { opt_in_tags: updates.opt_in_tags }),
    },
  })

  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    billing_email: o.billing_email ?? undefined,
    opt_in_tags: o.opt_in_tags ?? [],
    stripe_customer_id: o.stripe_customer_id ?? '',
  }
}

export async function deleteOrganization({ claims, slug }: { claims: Claims; slug: string }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  // Capture the org id BEFORE deletion so we can record an audit log entry.
  const orgRow = await executeQuery<{ id: number; name: string }>({
    query: `
      select o.id, o.name
      from saas.organizations o
      where o.slug = $1
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = o.id
            and m.gotrue_id = $2
            and m.role = 'owner'
        )
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (orgRow.error) throw orgRow.error
  const targetOrg = orgRow.data?.[0]

  // Delete only projects that belong to an organization the current user owns.
  // This avoids accidental cross-tenant deletion when a slug is provided for an org
  // the user does not own.
  const deleteProjects = await executeQuery({
    query: `
      delete from saas.projects p
      using saas.organizations o
      where o.id = p.organization_id
        and o.slug = $1
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = o.id
            and m.gotrue_id = $2
            and m.role = 'owner'
        )
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (deleteProjects.error) throw deleteProjects.error

  const deleted = await executeQuery<{ slug: string }>({
    query: `
      delete from saas.organizations o
      where o.slug = $1
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = o.id
            and m.gotrue_id = $2::uuid
            and m.role = 'owner'
        )
        and (select set_config('app.allow_organization_teardown', 'true', true)) is not null
      returning o.slug
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })

  if (deleted.error) throw deleted.error
  const wasDeleted = Boolean(deleted.data?.length)

  if (wasDeleted && targetOrg) {
    await recordAuditLog({
      claims,
      organizationId: null, // org row no longer exists
      action: 'org.delete',
      targetType: 'organization',
      targetDescription: `Organization "${targetOrg.name}" (${slug})`,
      metadata: { slug, organization_id: targetOrg.id },
    })
  }

  return wasDeleted
}

export async function listProjects({
  claims,
  limit,
  offset,
  search,
}: {
  claims: Claims
  limit?: number
  offset?: number
  search?: string
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const qLimit = Math.min(Math.max(limit ?? 100, 1), 200)
  const qOffset = Math.max(offset ?? 0, 0)
  const qSearch = search?.trim()

  const count = await executeQuery<{ count: string }>({
    query: `
      select count(*)::text as count
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where m.gotrue_id = $1
        and p.is_branch = false
      ${qSearch ? `and (p.name ilike '%' || $2 || '%' or p.ref ilike '%' || $2 || '%')` : ''}
    `,
    parameters: qSearch ? [gotrueId, qSearch] : [gotrueId],
    actorId: gotrueId,
  })
  if (count.error) throw count.error

  const projects = await executeQuery<{
    id: number
    ref: string
    name: string
    organization_id: number
    organization_slug: string
    cloud_provider: string
    region: string
    status: string
    inserted_at: string | null
    is_branch: boolean
    preview_branch_refs: string[]
    preview_branching_enabled: boolean
    subscription_id: string
    has_dedicated_database: boolean
    data_plane_last_provisioned_at: string | null
    data_plane_last_provision_ok: string | null
    physical_backups_enabled: boolean
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.name,
        p.organization_id,
        p.organization_slug,
        p.cloud_provider,
        p.region,
        p.status,
        p.inserted_at as inserted_at,
        p.is_branch,
        p.preview_branch_refs,
        coalesce(p.preview_branching_enabled, false) as preview_branching_enabled,
        p.subscription_id,
        (coalesce(trim(p.connection_string_enc), '') <> '' or coalesce(trim(p.connection_string), '') <> '') as has_dedicated_database,
        p.data_plane_last_provisioned_at,
        (p.data_plane_last_provision_result->>'ok') as data_plane_last_provision_ok,
        coalesce(p.physical_backups_enabled, false) as physical_backups_enabled
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where m.gotrue_id = $1
        and p.is_branch = false
      ${qSearch ? `and (p.name ilike '%' || $2 || '%' or p.ref ilike '%' || $2 || '%')` : ''}
      order by p.name asc
      limit $${qSearch ? 3 : 2} offset $${qSearch ? 4 : 3}
    `,
    parameters: qSearch ? [gotrueId, qSearch, qLimit, qOffset] : [gotrueId, qLimit, qOffset],
    actorId: gotrueId,
  })
  if (projects.error) throw projects.error

  const failedRefs = (projects.data ?? [])
    .filter((p) => p.has_dedicated_database && p.data_plane_last_provision_ok === 'false')
    .map((p) => p.ref)
  if (failedRefs.length > 0) {
    void import('./tenant-data-plane-provision').then(({ scheduleDataPlaneRepairForProjectRefs }) =>
      scheduleDataPlaneRepairForProjectRefs(failedRefs, gotrueId)
    )
  }

  return {
    pagination: {
      count: parseInt(count.data?.[0]?.count ?? '0', 10),
      limit: qLimit,
      offset: qOffset,
    },
    projects: (projects.data ?? []).map((p) => ({
      cloud_provider: p.cloud_provider,
      id: p.id,
      inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : null,
      is_branch_enabled:
        !p.is_branch &&
        (process.env.SAAS_BRANCHING_ENABLED !== 'false' ||
          Boolean(p.preview_branching_enabled) ||
          (p.preview_branch_refs?.length ?? 0) > 0),
      is_physical_backups_enabled: p.physical_backups_enabled,
      name: p.name,
      organization_id: p.organization_id,
      organization_slug: p.organization_slug,
      preview_branch_refs: p.preview_branch_refs ?? [],
      ref: p.ref,
      region: p.region,
      status: p.status,
      subscription_id: p.subscription_id ?? null,
      has_dedicated_database: p.has_dedicated_database,
      data_plane_last_provisioned_at: p.data_plane_last_provisioned_at
        ? new Date(p.data_plane_last_provisioned_at).toISOString()
        : null,
      data_plane_last_provision_ok:
        p.data_plane_last_provision_ok === 'true'
          ? true
          : p.data_plane_last_provision_ok === 'false'
            ? false
            : null,
    })),
  }
}

/**
 * Promote PROVISIONING → ACTIVE_HEALTHY only when the tenant data plane is reachable.
 */
async function promoteProjectToActiveHealthy({
  projectRef,
  gotrueId,
  portBase,
}: {
  projectRef: string
  gotrueId: string
  portBase?: number | null
}): Promise<boolean> {
  const { isDataPlaneProvisionerConfigured } = await import('./tenant-data-plane-provision')
  if (isDataPlaneProvisionerConfigured()) {
    const { isTenantDataPlaneReachable } = await import('./tenant-data-plane-health')
    const reachable = await isTenantDataPlaneReachable(projectRef, portBase)
    if (!reachable) return false
  }

  const saved = await executeQuery({
    query: `
      update saas.projects p
      set status = 'ACTIVE_HEALTHY'
      where p.ref = $1
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = p.organization_id
            and m.gotrue_id = $2
            and m.role in ('owner','admin','developer')
        )
    `,
    parameters: [projectRef, gotrueId],
    actorId: gotrueId,
  })
  if (saved.error) throw saved.error
  return true
}

/**
 * Finishes dedicated-tenant provisioning after insert (or repairs a stuck PROVISIONING row).
 * Idempotent: reuses existing tenant DB/role when present.
 */
export async function finalizeDedicatedProjectProvisioning({
  projectRef,
  gotrueId,
  deleteOnFailure,
  userDbPass,
}: {
  projectRef: string
  gotrueId: string
  deleteOnFailure: boolean
  userDbPass?: string
}): Promise<void> {
  const dedicatedOnCreate = process.env.SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE !== 'false'

  if (!dedicatedOnCreate) {
    const saved = await executeQuery({
      query: `
      update saas.projects p
      set status = 'ACTIVE_HEALTHY',
          data_plane_port_base = null,
          connection_string = null,
          connection_string_enc = null,
          data_plane_mode = 'model_a'
      where p.ref = $1
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = p.organization_id
            and m.gotrue_id = $2
            and m.role in ('owner','admin','developer')
        )
    `,
      parameters: [projectRef, gotrueId],
      actorId: gotrueId,
    })
    if (saved.error) throw saved.error
    return
  }

  const planRow = await executeQuery<{ plan: string }>({
    query: `
      select o.plan
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where p.ref = $1
      limit 1
    `,
    parameters: [projectRef],
    actorId: gotrueId,
  })
  if (planRow.error) throw planRow.error
  const dataPlaneMode = resolveDataPlaneModeForPlan(planRow.data?.[0]?.plan as PlanId | undefined)

  const host = process.env.POSTGRES_HOST?.trim()
  const adminPassword = process.env.POSTGRES_PASSWORD ?? ''
  const adminUser = resolveTenantProvisionAdminUser()
  const port = parseInt(process.env.POSTGRES_PORT || '5432', 10)
  if (!host || !adminPassword) {
    throw new Error(
      'Dedicated project databases require POSTGRES_HOST and POSTGRES_PASSWORD on the Studio server. Set SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE=false to use legacy shared-database (Model A) mode.'
    )
  }

  try {
    const provisioned = await ensureTenantDatabaseBootstrapped({
      projectRef,
      host,
      port,
      adminUser,
      adminPassword,
      auxiliaryRolePassword: process.env.SAAS_DATA_PLANE_AUX_ROLE_PASSWORD?.trim(),
    })

    const effectiveUserDbPass = (process.env.SAAS_APPLY_USER_DB_PASS_ON_CREATE !== 'false'
      ? userDbPass
      : ''
    )?.trim()
    let connectionString = provisioned.connectionString
    if (effectiveUserDbPass && effectiveUserDbPass.length >= 8) {
      await setTenantRolePassword({
        host,
        port,
        adminUser,
        adminPassword,
        dbName: provisioned.dbName,
        tenantRoleName: provisioned.roleName,
        password: effectiveUserDbPass,
      })
      const u = new URL(connectionString.replace(/^postgres:\/\//, 'postgresql://'))
      u.password = encodeURIComponent(effectiveUserDbPass)
      connectionString = u.toString()
    }

    const enc = encryptString(connectionString)
    const portBase = await allocateDataPlanePortBase(projectRef)
    const claims = { sub: gotrueId } as Claims
    const saved = await executeQuery({
      query: `
          update saas.projects p
          set data_plane_port_base = $1,
              connection_string = null,
              connection_string_enc = $2,
              db_host = $3,
              data_plane_mode = $4
          where p.ref = $5
            and exists (
              select 1
              from saas.organization_members m
              where m.organization_id = p.organization_id
                and m.gotrue_id = $6
                and m.role in ('owner','admin','developer')
            )
        `,
      parameters: [portBase, enc, host, dataPlaneMode, projectRef, gotrueId],
      actorId: gotrueId,
    })
    if (saved.error) throw saved.error

    if (process.env.SAAS_AUTO_PROVISION_DATA_PLANE_ON_CREATE !== 'false') {
      const {
        isDataPlaneProvisionerConfigured,
        provisionTenantDataPlaneStack,
      } = await import('./tenant-data-plane-provision')
      if (isDataPlaneProvisionerConfigured()) {
        try {
          await provisionTenantDataPlaneStack({
            claims,
            ref: projectRef,
            apply: true,
            reason: 'project_create',
          })
          const { ensureTenantGoTrueAuthSchemaForActor } = await import('./tenant-gotrue-schema')
          await ensureTenantGoTrueAuthSchemaForActor({ ref: projectRef, actorId: gotrueId })
        } catch (e) {
          await recordDataPlaneProvisionFailure({
            claims,
            ref: projectRef,
            error: e,
            reason: 'project_create',
          }).catch(() => undefined)
          console.warn(
            '[saas] data-plane provision failed for %s; staying PROVISIONING until auto-repair succeeds: %O',
            projectRef,
            e
          )
          return
        }
      }
    }

    const promoted = await promoteProjectToActiveHealthy({
      projectRef,
      gotrueId,
      portBase,
    })
    if (!promoted) {
      await recordDataPlaneProvisionFailure({
        claims,
        ref: projectRef,
        error: new Error('Tenant data plane unreachable after provision'),
        reason: 'project_create',
      }).catch(() => undefined)
    }
  } catch (err) {
    if (deleteOnFailure) {
      await executeQuery({
        query: 'delete from saas.projects where ref = $1',
        parameters: [projectRef],
        actorId: gotrueId,
      })
    }
    throw err
  }
}

/**
 * Provisions a per-project tenant database for legacy Model A projects (shared control-plane DB).
 * Idempotent when a dedicated connection string is already stored on the project row.
 */
export async function provisionDedicatedTenantDatabaseForProject({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const gotrueId = getGotrueUserId(claims)
  const row = await executeQuery<{
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer')
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) {
    throw new Error('Project not found')
  }
  const p = row.data[0]!
  const enc = (p.connection_string_enc ?? '').trim()
  const plain = (p.connection_string ?? '').trim()
  if (enc || plain) {
    const tenantUrl = enc ? decryptString(enc) : plain
    const host = process.env.POSTGRES_HOST?.trim()
    const adminPassword = process.env.POSTGRES_PASSWORD ?? ''
    const adminUser = resolveTenantProvisionAdminUser()
    const port = parseInt(process.env.POSTGRES_PORT || '5432', 10)
    if (host && adminPassword && tenantUrl?.trim()) {
      const u = new URL(tenantUrl.trim().replace(/^postgres:\/\//, 'postgresql://'))
      const dbName = u.pathname.replace(/^\//, '')
      if (dbName) {
        const bootstrapped = await isTenantDatabaseBootstrapped({
          host,
          port,
          adminUser,
          adminPassword,
          dbName,
        })
        if (bootstrapped) {
          return { ok: true as const, alreadyProvisioned: true }
        }
      }
    } else {
      return { ok: true as const, alreadyProvisioned: true }
    }
  }

  await finalizeDedicatedProjectProvisioning({
    projectRef: ref,
    gotrueId,
    deleteOnFailure: false,
  })

  return { ok: true as const, alreadyProvisioned: false }
}

/** Repair projects left in PROVISIONING when tenant DB exists but control-plane row was not finalized. */
async function tryCompleteStuckProvisioningProject({
  ref,
  gotrueId,
}: {
  ref: string
  gotrueId: string
}): Promise<void> {
  const row = await executeQuery<{
    status: string
    connection_string_enc: string | null
    data_plane_port_base: number | null
  }>({
    query: `select status, connection_string_enc, data_plane_port_base from saas.projects where ref = $1`,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  const p = row.data?.[0]
  if (!p || p.status !== 'PROVISIONING') return

  if (p.connection_string_enc?.trim()) {
    const claims = { sub: gotrueId } as Claims
    try {
      const { ensureTenantDataPlaneHealthy } = await import('./tenant-data-plane-provision')
      await ensureTenantDataPlaneHealthy({
        claims,
        ref,
        reason: 'stuck_provisioning_repair',
        force: true,
      })
    } catch (e) {
      console.warn('[saas] data-plane repair after stuck provisioning for %s: %O', ref, e)
      return
    }
    await promoteProjectToActiveHealthy({
      projectRef: ref,
      gotrueId,
      portBase: p.data_plane_port_base,
    })
    return
  }

  try {
    await finalizeDedicatedProjectProvisioning({
      projectRef: ref,
      gotrueId,
      deleteOnFailure: false,
    })
  } catch (e) {
    console.warn('[saas] tryCompleteStuckProvisioningProject failed for %s: %O', ref, e)
  }
}

export async function createProject({
  claims,
  body,
}: {
  claims: Claims
  body: {
    name: string
    organization_slug: string
    db_pass: string
    cloud_provider: string
    db_region?: string
    region_selection?: { code?: string }
    desired_instance_size?: string
    data_api_exposed_schemas?: string[]
    data_api_use_api_schema?: boolean
    postgres_engine?: string
    release_channel?: string
  }
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const jwtSecret = resolveProjectJwtSecret(null)

  const orgRows = await executeQuery<{
    id: number
    organization_slug: string
    role: string
  }>({
    query: `
      select o.id, o.slug as organization_slug, m.role
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [body.organization_slug, gotrueId],
    actorId: gotrueId,
  })
  if (orgRows.error) throw orgRows.error
  if (!orgRows.data?.length) throw new Error('Organization not found')
  if (orgRows.data[0].role === 'viewer') throw new Error('Insufficient permissions to create projects')

  const org = orgRows.data[0]
  await assertOrganizationNotPlatformSuspendedById(org.id, gotrueId)
  const ref = uniqueProjectRef(body.name)
  const region = body.db_region || body.region_selection?.code || 'local'
  const anonKey = makeProjectJwt(jwtSecret, 'anon', ref)
  const serviceKey = makeProjectJwt(jwtSecret, 'service_role', ref)

  const inserted = await executeQuery<{
    id: number
    ref: string
    name: string
    organization_id: number
    organization_slug: string
    cloud_provider: string
    region: string
    status: string
    inserted_at: string
  }>({
    query: `
      insert into saas.projects (
        organization_id,
        organization_slug,
        ref,
        name,
        cloud_provider,
        region,
        status,
        service_key,
        anon_key,
        service_key_enc,
        anon_key_enc,
        subscription_id,
        rest_url,
        db_host,
        connection_string,
        connection_string_enc,
        db_pass_enc
      ) values (
        $1, $2, $3, $4, $5, $6, 'PROVISIONING',
        '', '', $7, $8,
        '',
        $9, '127.0.0.1', null, null, $10
      )
      returning id, ref, name, organization_id, organization_slug, cloud_provider, region, status, inserted_at
    `,
    parameters: [
      org.id,
      body.organization_slug,
      ref,
      body.name,
      body.cloud_provider || 'localhost',
      region,
      encryptString(serviceKey),
      encryptString(anonKey),
      PROJECT_REST_URL,
      encryptString(body.db_pass),
    ],
    actorId: gotrueId,
  })

  if (inserted.error || !inserted.data?.length) throw inserted.error ?? new Error('Failed to create project')
  const p = inserted.data[0]

  try {
    await finalizeDedicatedProjectProvisioning({
      projectRef: p.ref,
      gotrueId,
      deleteOnFailure: true,
      userDbPass: body.db_pass,
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('POSTGRES_HOST')) {
      await executeQuery({
        query: 'delete from saas.projects where ref = $1',
        parameters: [p.ref],
        actorId: gotrueId,
      })
    }
    throw err
  }

  await recordAuditLog({
    claims,
    organizationId: p.organization_id,
    projectRef: p.ref,
    action: 'project.create',
    targetType: 'project',
    targetDescription: `Project "${p.name}" (${p.ref})`,
    metadata: { project_id: p.id, organization_slug: p.organization_slug },
  })

  const statusRow = await executeQuery<{ status: string }>({
    query: `select status from saas.projects where ref = $1 limit 1`,
    parameters: [p.ref],
    actorId: gotrueId,
  })
  const projectStatus = statusRow.data?.[0]?.status ?? 'PROVISIONING'

  return {
    anon_key: anonKey,
    cloud_provider: p.cloud_provider,
    endpoint: PROJECT_ENDPOINT,
    id: p.id,
    name: p.name,
    organization_id: p.organization_id,
    organization_slug: p.organization_slug,
    preview_branch_refs: [],
    ref: p.ref,
    region: p.region,
    service_key: serviceKey,
    status: projectStatus,
    subscription_id: null,
    inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : null,
    is_branch_enabled: process.env.SAAS_BRANCHING_ENABLED !== 'false',
    is_physical_backups_enabled: false,
  }
}

export async function getProject({ claims, ref }: { claims: Claims; ref: string }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  void tryCompleteStuckProvisioningProject({ ref, gotrueId }).catch((e) => {
    console.warn('[saas] tryCompleteStuckProvisioningProject background failed for %s: %O', ref, e)
  })
  void import('./tenant-data-plane-provision')
    .then(async ({ ensureTenantDataPlaneHealthy }) => {
      const row = await executeQuery<{ ok: string | null }>({
        query: `select (data_plane_last_provision_result->>'ok') as ok from saas.projects where ref = $1`,
        parameters: [ref],
        actorId: gotrueId,
      })
      const force = row.data?.[0]?.ok === 'false'
      await ensureTenantDataPlaneHealthy({
        claims: { sub: gotrueId } as Claims,
        ref,
        reason: 'get_project',
        force,
      })
    })
    .catch((e) => {
      console.warn('[saas] data-plane auto-repair skipped for %s: %O', ref, e)
    })

  const rows = await executeQuery<{
    id: number
    ref: string
    name: string
    organization_id: number
    organization_slug: string
    cloud_provider: string
    region: string
    status: string
    inserted_at: string | null
    is_branch: boolean
    parent_project_ref: string | null
    preview_branch_refs: string[]
    preview_branching_enabled: boolean
    service_key: string
    anon_key: string
    connection_string: string | null
    connection_string_enc: string | null
    data_plane_last_provisioned_at: string | null
    physical_backups_enabled: boolean
    data_plane_mode: string
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.name,
        p.organization_id,
        p.organization_slug,
        p.cloud_provider,
        p.region,
        p.status,
        p.inserted_at,
        p.is_branch,
        p.parent_project_ref,
        p.preview_branch_refs,
        coalesce(p.preview_branching_enabled, false) as preview_branching_enabled,
        p.service_key,
        p.anon_key,
        p.connection_string,
        p.connection_string_enc,
        p.data_plane_last_provisioned_at,
        coalesce(p.physical_backups_enabled, false) as physical_backups_enabled,
        p.data_plane_mode
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })

  if (rows.error) throw rows.error

  if (!rows.data?.length) return null

  const p = rows.data[0]
  const tenantDatabaseUrl =
    p.connection_string_enc && p.connection_string_enc.trim()
      ? decryptString(p.connection_string_enc)
      : p.connection_string

  // Lazy backfill: migrate plaintext -> encrypted-at-rest when an owner/admin loads the project.
  // Keeps existing deployments working without requiring a one-off script.
  if (
    tenantDatabaseUrl?.trim() &&
    (!p.connection_string_enc || !p.connection_string_enc.trim()) &&
    p.connection_string?.trim()
  ) {
    const migrate = await executeQuery({
      query: `
        update saas.projects p
        set connection_string = null,
            connection_string_enc = $1
        where p.ref = $2
          and exists (
            select 1
            from saas.organization_members m
            where m.organization_id = p.organization_id
              and m.gotrue_id = $3
              and m.role in ('owner','admin')
          )
      `,
      parameters: [encryptString(tenantDatabaseUrl), p.ref, gotrueId],
      actorId: gotrueId,
    })
    if (migrate.error) throw migrate.error
  }

  // Prefer per-project database URI (encrypted). Fall back to shared POSTGRES_* when unset (legacy Model A).
  const sharedDbUrl =
    process.env.POSTGRES_PASSWORD && process.env.POSTGRES_HOST && process.env.POSTGRES_DB
      ? `postgres://${process.env.POSTGRES_USER ?? 'postgres'}:${process.env.POSTGRES_PASSWORD}@${
          process.env.POSTGRES_HOST
        }:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB}`
      : null

  const effectiveDbUrl = tenantDatabaseUrl?.trim() ? tenantDatabaseUrl : sharedDbUrl
  const hasDedicated = Boolean(tenantDatabaseUrl?.trim())
  const { restUrl } = resolveSaaSTenantRestUrls(p.ref, hasDedicated, p.data_plane_mode)
  return {
    cloud_provider: p.cloud_provider,
    // pg-meta expects `x-connection-encrypted` header value to be encrypted.
    // The frontend forwards this `connectionString` into that header.
    // Per-tenant DB: plaintext URI in saas.projects.connection_string; else POSTGRES_* fallback.
    connectionString: encryptedConnectionForPgMeta(effectiveDbUrl ?? ''),
    db_host: process.env.POSTGRES_HOST || '127.0.0.1',
    id: p.id,
    inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : new Date(0).toISOString(),
    is_branch_enabled:
      !p.is_branch &&
      (process.env.SAAS_BRANCHING_ENABLED !== 'false' ||
        Boolean(p.preview_branching_enabled) ||
        (p.preview_branch_refs?.length ?? 0) > 0),
    is_physical_backups_enabled: p.physical_backups_enabled,
    name: p.name,
    organization_id: p.organization_id,
    organization_slug: p.organization_slug,
    parent_project_ref: p.parent_project_ref ?? undefined,
    ref: p.ref,
    region: p.region,
    restUrl,
    status: p.status,
    subscription_id: '',
  }
}

function parsePostgresUrlForSupavisorDisplay(url: string): {
  host: string
  port: number
  database: string
  user: string
} | null {
  try {
    const u = new URL(url.trim().replace(/^postgres:\/\//, 'postgresql://'))
    const db = (u.pathname.replace(/^\//, '') || 'postgres').split('?')[0]!
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 5432,
      database: db,
      user: u.username ? decodeURIComponent(u.username) : 'postgres',
    }
  } catch {
    return null
  }
}

type SupavisorConfigRow = {
  connection_string: string
  connectionString: string
  database_type: 'PRIMARY' | 'READ_REPLICA'
  db_host: string
  db_name: string
  db_port: number
  db_user: string
  default_pool_size: number | null
  identifier: string
  is_using_scram_auth: boolean
  max_client_conn: number | null
  pool_mode: 'transaction' | 'session'
}

/**
 * Supavisor-shaped rows for Connect / pooling UI.
 * Dedicated DB: `db_*` come from the decrypted tenant connection URL (no password returned).
 * Optional pooler URI when `SAAS_TENANT_POOLER_HOST` is set (Supavisor-style `postgres.<ref>` user).
 */
export async function getSaaSSupavisorConfigRows({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<SupavisorConfigRow[] | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims as Claims)

  const row = await executeQuery<{
    ref: string
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.ref, p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) return null

  const p = row.data[0]!
  const enc = (p.connection_string_enc ?? '').trim()
  const tenantUrl = enc.length > 0 ? decryptString(enc) : p.connection_string
  const parsed = tenantUrl?.trim() ? parsePostgresUrlForSupavisorDisplay(tenantUrl.trim()) : null

  const dbHost = parsed?.host ?? (process.env.POSTGRES_HOST || '127.0.0.1')
  const dbName = parsed?.database ?? (process.env.POSTGRES_DB || 'postgres')
  const dbPort = parsed?.port ?? parseInt(process.env.POSTGRES_PORT || '5432', 10)
  const dbUser = parsed?.user ?? (process.env.POSTGRES_USER || 'postgres')

  const primary: SupavisorConfigRow = {
    connection_string: '',
    connectionString: '',
    database_type: 'PRIMARY',
    db_host: dbHost,
    db_name: dbName,
    db_port: dbPort,
    db_user: dbUser,
    default_pool_size: null,
    identifier: ref,
    is_using_scram_auth: false,
    max_client_conn: null,
    pool_mode: 'transaction',
  }

  const out: SupavisorConfigRow[] = [primary]

  const embedPooler = process.env.SAAS_TENANT_EMBED_SUPAVISOR === 'true'
  const poolHost =
    process.env.SAAS_TENANT_POOLER_HOST?.trim() ||
    (embedPooler && parsed
      ? `${ref}.${resolvePublicDomainForTenantStack().trim() || 'localhost'}`
      : '')
  if (poolHost && parsed) {
    const poolPort = parseInt(process.env.SAAS_TENANT_POOLER_PORT || '6543', 10)
    const poolUser = `postgres.${ref}`
    const poolUri = `postgresql://${encodeURIComponent(poolUser)}@${poolHost}:${poolPort}/${encodeURIComponent(parsed.database)}`
    out.push({
      connection_string: poolUri,
      connectionString: poolUri,
      database_type: 'READ_REPLICA',
      db_host: poolHost,
      db_name: parsed.database,
      db_port: poolPort,
      db_user: poolUser,
      default_pool_size: null,
      identifier: `${ref}-pooler`,
      is_using_scram_auth: false,
      max_client_conn: null,
      pool_mode: 'transaction',
    })
  }

  return out
}

/**
 * Payload for `/api/platform/props/project/[ref]/api` — real project ref, keys, and API host.
 * Dedicated-tenant DB: `endpoint` = `ref.<SAAS_PUBLIC_DOMAIN>` and REST URL on that host (per Traefik).
 * Shared stack: uses `SUPABASE_PUBLIC_URL` from env (same as Kong).
 */
export async function getSaaSProjectPropsApiPayload({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<{
  project: Record<string, unknown>
  autoApiService: Record<string, unknown>
} | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims as Claims)

  const row = await executeQuery<{
    id: number
    ref: string
    name: string
    organization_id: number
    organization_slug: string
    cloud_provider: string
    region: string
    status: string
    inserted_at: string | null
    service_key: string
    anon_key: string
    service_key_enc: string | null
    anon_key_enc: string | null
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.name,
        p.organization_id,
        p.organization_slug,
        p.cloud_provider,
        p.region,
        p.status,
        p.inserted_at,
        p.service_key,
        p.anon_key,
        p.service_key_enc,
        p.anon_key_enc,
        p.connection_string,
        p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) return null

  const p = row.data[0]!
  const anon = p.anon_key_enc?.trim() ? decryptString(p.anon_key_enc) : p.anon_key
  const service = p.service_key_enc?.trim() ? decryptString(p.service_key_enc) : p.service_key

  const enc = (p.connection_string_enc ?? '').trim()
  const tenantDbUrl = enc.length > 0 ? decryptString(enc) : p.connection_string
  const hasDedicated = Boolean(tenantDbUrl?.trim())

  const { endpointHost, restUrl, protocol: endpointProtocol } = resolveSaaSTenantRestUrls(p.ref, hasDedicated)

  const pgHost = process.env.POSTGRES_HOST || '127.0.0.1'
  const pgPort = parseInt(process.env.POSTGRES_PORT || '5432', 10)
  const pgDb = process.env.POSTGRES_DB || 'postgres'
  const pgUser = process.env.POSTGRES_USER || 'postgres'

  const insertedAt = p.inserted_at ? new Date(p.inserted_at).toISOString() : new Date(0).toISOString()

  const project = {
    id: p.id,
    ref: p.ref,
    name: p.name,
    organization_id: p.organization_id,
    organization_slug: p.organization_slug,
    cloud_provider: p.cloud_provider,
    region: p.region,
    status: p.status,
    inserted_at: insertedAt,
    api_key_supabase_encrypted: '',
    db_host: pgHost,
    db_name: pgDb,
    db_port: pgPort,
    db_ssl: false,
    db_user: pgUser,
    services: [
      {
        id: 1,
        name: 'Default API',
        app: { id: 1, name: 'Auto API' },
        app_config: {
          db_schema: 'public',
          endpoint: endpointHost,
          realtime_enabled: true,
        },
        service_api_keys: [
          { api_key_encrypted: '-', name: 'service_role key', tags: 'service_role' },
          { api_key_encrypted: '-', name: 'anon key', tags: 'anon' },
        ],
      },
    ],
  }

  const autoApiService = {
    id: 1,
    name: 'Default API',
    project: { ref: p.ref },
    app: { id: 1, name: 'Auto API' },
    app_config: {
      db_schema: 'public',
      endpoint: endpointHost,
      realtime_enabled: true,
    },
    protocol: endpointProtocol,
    endpoint: endpointHost,
    restUrl,
    defaultApiKey: anon,
    serviceApiKey: service,
    service_api_keys: [
      { api_key_encrypted: '-', name: 'service_role key', tags: 'service_role' },
      { api_key_encrypted: '-', name: 'anon key', tags: 'anon' },
    ],
  }

  return { project, autoApiService }
}

/** Org-level props for `/api/platform/props/org/[slug]` (billing UI expects stable keys). */
export async function getSaaSOrgPropsPayload({
  claims,
  slug,
}: {
  claims: JwtPayload
  slug: string
}): Promise<{
  members: { gotrue_id: string; role: string; inserted_at: string }[]
  products: unknown[]
  customer: {
    customer: Record<string, unknown>
    subscriptions: Record<string, unknown>
    total_paid_projects: number
    total_free_projects: number
    total_pro_projects: number
    total_team_projects: number
    total_payg_projects: number
  }
} | null> {
  const c = claims as Claims
  const org = await getOrganization({ claims: c, slug })
  if (!org) return null

  const members = await listOrganizationMembers({ claims: c, slug })
  const gotrueId = getGotrueUserId(c)

  const cnt = await executeQuery<{ cnt: string }>({
    query: `
      select count(*)::text as cnt
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (cnt.error) throw cnt.error
  const total = parseInt(cnt.data?.[0]?.cnt ?? '0', 10) || 0

  return {
    members: members.map((m) => ({
      gotrue_id: m.gotrue_id,
      role: m.role,
      inserted_at: m.inserted_at,
    })),
    products: [],
    customer: {
      customer: {},
      subscriptions: {},
      total_paid_projects: 0,
      total_free_projects: total,
      total_pro_projects: 0,
      total_team_projects: 0,
      total_payg_projects: 0,
    },
  }
}

export async function bulkBackfillTenantDataPlaneBootstrap({
  claims,
  slug,
}: {
  claims: JwtPayload
  slug: string
}): Promise<{
  results: { ref: string; skipped: boolean; ok: boolean; message?: string }[]
} | null> {
  const c = claims as Claims
  const gotrueId = getGotrueUserId(c)

  const admin = await executeQuery<{ id: number }>({
    query: `
      select o.id
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin')
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (admin.error) throw admin.error
  if (!admin.data?.length) return null

  const rows = await executeQuery<{
    ref: string
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.ref, p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where o.slug = $1
      order by p.name asc
    `,
    parameters: [slug],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error

  const results: { ref: string; skipped: boolean; ok: boolean; message?: string }[] = []
  for (const p of rows.data ?? []) {
    const enc = (p.connection_string_enc ?? '').trim()
    const url = enc.length > 0 ? decryptString(enc) : p.connection_string
    if (!url?.trim()) {
      results.push({ ref: p.ref, skipped: true, ok: true, message: 'No dedicated tenant database URL' })
      continue
    }
    try {
      await runTenantDataPlaneBootstrapFromConnectionString(url.trim())
      results.push({ ref: p.ref, skipped: false, ok: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      results.push({ ref: p.ref, skipped: false, ok: false, message })
    }
  }

  return { results }
}

/** SMTP + mailer settings for tenant GoTrue (shared control-plane mail or SAAS_TENANT_SMTP_*). */
function resolveTenantGoTrueMailerEnv(opts: { apiExternalUrl: string; siteUrl: string }) {
  const smtpHost =
    process.env.SAAS_TENANT_SMTP_HOST?.trim() || process.env.SMTP_HOST?.trim() || 'indobase-mail'
  const smtpPort =
    process.env.SAAS_TENANT_SMTP_PORT?.trim() || process.env.SMTP_PORT?.trim() || '2500'
  const smtpUser = process.env.SAAS_TENANT_SMTP_USER?.trim() ?? process.env.SMTP_USER?.trim() ?? ''
  const smtpPass = process.env.SAAS_TENANT_SMTP_PASS?.trim() ?? process.env.SMTP_PASS?.trim() ?? ''
  const smtpAdminEmail =
    process.env.SAAS_TENANT_SMTP_ADMIN_EMAIL?.trim() ||
    process.env.SMTP_ADMIN_EMAIL?.trim() ||
    'auth@indobase.in'
  const smtpSenderName =
    process.env.SAAS_TENANT_SMTP_SENDER_NAME?.trim() ||
    process.env.SMTP_SENDER_NAME?.trim() ||
    'Indobase'
  const autoConfirmRaw =
    process.env.SAAS_TENANT_MAILER_AUTOCONFIRM?.trim() ??
    process.env.ENABLE_EMAIL_AUTOCONFIRM?.trim() ??
    'false'
  const autoConfirm = autoConfirmRaw === 'true' ? 'true' : 'false'

  const hosts = new Set<string>()
  for (const raw of [opts.apiExternalUrl, opts.siteUrl]) {
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
      if (u.hostname) hosts.add(u.hostname)
    } catch {
      // ignore
    }
  }
  for (const h of (process.env.SAAS_MAILER_EXTERNAL_HOSTS ?? '').split(',')) {
    const t = h.trim()
    if (t) hosts.add(t)
  }
  for (const raw of [
    process.env.SITE_URL?.trim(),
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    process.env.API_URL?.trim(),
    process.env.NEXT_PUBLIC_API_URL?.trim(),
  ]) {
    if (!raw) continue
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
      if (u.hostname) hosts.add(u.hostname)
    } catch {
      // ignore
    }
  }

  return {
    autoConfirm: composeYamlSingleQuoted(autoConfirm),
    externalHosts: composeYamlSingleQuoted([...hosts].join(',')),
    smtpHost: composeYamlSingleQuoted(smtpHost),
    smtpPort: composeYamlSingleQuoted(smtpPort),
    smtpUser: composeYamlSingleQuoted(smtpUser),
    smtpPass: composeYamlSingleQuoted(smtpPass),
    smtpAdminEmail: composeYamlSingleQuoted(smtpAdminEmail),
    smtpSenderName: composeYamlSingleQuoted(smtpSenderName),
  }
}

function buildSlimTenantDockerCompose(opts: {
  ref: string
  ports: {
    rest: number
    auth: number
    storage: number
    realtime: number
    functions: number
    site: number
    pooler?: number
  }
  restDbUri: string
  authDbUri: string
  storageDbUri: string
  jwtSecret: string
  gotrueJwtKeys?: string | null
  anonKey: string
  serviceKey: string
  apiExternalUrl: string
  siteUrl: string
  uriAllowList: string
  realtime: {
    dbHost: string
    dbPort: string
    dbName: string
    dbUser: string
    dbPassword: string
    secretKeyBase: string
    dbEncKey: string
  }
  /** When set, appends Supavisor (transaction pool on 6543) + compose `configs` for pooler.exs. */
  pooler?: {
    ectoMetadataUrl: string
    exsBody: string
    secretKeyBase: string
    vaultEncKey: string
    auxDbPassword: string
  } | null
  edgeFunctionSecrets?: Record<string, string>
}): string {
  const mailer = resolveTenantGoTrueMailerEnv({
    apiExternalUrl: opts.apiExternalUrl,
    siteUrl: opts.siteUrl,
  })
  const edgeMem = tenantEdgeRuntimeMemLimit()
  const pgrstMem = tenantPostgrestMemLimit()
  const pgrstPool = tenantPostgrestDbPool()
  const pgrstPoolAcquire = tenantPostgrestPoolAcquisitionTimeout()
  const pgrstPoolIdle = tenantPostgrestPoolMaxIdletime()
  const pgrstMaxRows = tenantPostgrestDbMaxRows()
  const rtNofile = tenantRealtimeRlimitNofile()
  const rtDbPool = tenantRealtimeDbPoolSize()
  const storageFileLimit = tenantStorageFileSizeLimitBytes()
  const imgproxyBuf = tenantImgproxyDownloadBufferBytes()
  const imgproxyDlTimeout = tenantImgproxyDownloadTimeoutSeconds()
  const poolerMaxClientConn = String(
    Math.max(50, parseInt(process.env.SAAS_TENANT_POOLER_MAX_CLIENT_CONN?.trim() || '400', 10) || 400)
  )
  const net = (process.env.SAAS_DOCKER_NETWORK_NAME || 'indobase_default').trim()
  const functionsHostPath = (
    process.env.SAAS_TENANT_FUNCTIONS_HOST_PATH || process.env.INDOBASE_FUNCTIONS_DIR || ''
  ).trim()
  const useBindMountFunctions = functionsHostPath.length > 0
  const functionsVolumeYaml = useBindMountFunctions
    ? `      - ${composeYamlSingleQuoted(functionsHostPath)}:/home/deno/functions:Z`
    : `      - tenant-functions-${opts.ref}:/home/deno/functions:Z`
  const reservedFunctionEnvKeys = new Set([
    'JWT_SECRET',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VERIFY_JWT',
  ])
  const edgeFunctionSecretEnvYaml = Object.entries(opts.edgeFunctionSecrets ?? {})
    .filter(([key]) => /^[A-Z][A-Z0-9_]*$/.test(key) && !reservedFunctionEnvKeys.has(key))
    .map(([key, value]) => `      ${key}: ${composeYamlSingleQuoted(value)}`)
    .join('\n')
  const edgeFunctionSecretsBlock = edgeFunctionSecretEnvYaml
    ? `\n${edgeFunctionSecretEnvYaml}`
    : ''

  const restUri = composeYamlSingleQuoted(opts.restDbUri.trim())
  const authUri = composeYamlSingleQuoted(opts.authDbUri.trim())
  const storageUri = composeYamlSingleQuoted(opts.storageDbUri.trim())
  const jwt = composeYamlSingleQuoted(opts.jwtSecret)
  const apiEx = composeYamlSingleQuoted(opts.apiExternalUrl)
  const site = composeYamlSingleQuoted(opts.siteUrl)
  const allow = composeYamlSingleQuoted(opts.uriAllowList)
  const googleRedirectUri = composeYamlSingleQuoted(
    `${opts.apiExternalUrl.replace(/\/$/, '')}/auth/v1/callback`
  )
  const anon = composeYamlSingleQuoted(opts.anonKey)
  const svc = composeYamlSingleQuoted(opts.serviceKey)
  const googleClientId = composeYamlSingleQuoted(process.env.GOOGLE_CLIENT_ID?.trim() || '')
  const googleSecret = composeYamlSingleQuoted(process.env.GOOGLE_SECRET?.trim() || '')
  const googleEnabled = composeYamlSingleQuoted(
    process.env.GOOGLE_ENABLED === 'true' && (process.env.GOOGLE_CLIENT_ID?.trim() || '')
      ? 'true'
      : 'false'
  )
  const rtHost = composeYamlSingleQuoted(opts.realtime.dbHost)
  const rtPort = composeYamlSingleQuoted(opts.realtime.dbPort)
  const rtName = composeYamlSingleQuoted(opts.realtime.dbName)
  const rtUser = composeYamlSingleQuoted(opts.realtime.dbUser)
  const rtPass = composeYamlSingleQuoted(opts.realtime.dbPassword)
  const rtSkb = composeYamlSingleQuoted(opts.realtime.secretKeyBase)
  const rtEnc = composeYamlSingleQuoted(opts.realtime.dbEncKey)
  const bucket = composeYamlSingleQuoted(`tenant-${opts.ref}`)
  const imgproxyHost = `tenant-imgproxy-${opts.ref}`
  const tenantId = composeYamlSingleQuoted(opts.ref)
  const supabaseUrl = composeYamlSingleQuoted(opts.apiExternalUrl)

  const pool = opts.pooler
  const cfgName = pool && opts.ports.pooler != null ? `tpooler_exs_${sanitizeComposeRefToken(opts.ref)}` : ''
  const poolerServiceBlock =
    pool && opts.ports.pooler != null
      ? `
  tenant-pooler:
    image: supabase/supavisor:2.7.4
    container_name: supavisor-tenant-${sanitizeComposeRefToken(opts.ref)}
    restart: unless-stopped
    networks:
      - tenant_data_plane
    depends_on:
      tenant-realtime:
        condition: service_started
    ports:
      - ${composePortBinding(opts.ports.pooler!, 6543)}
    environment:
      PORT: "4000"
      REGION: local
      API_JWT_SECRET: ${composeYamlSingleQuoted(opts.jwtSecret)}
      METRICS_JWT_SECRET: ${composeYamlSingleQuoted(opts.jwtSecret)}
      SECRET_KEY_BASE: ${composeYamlSingleQuoted(pool.secretKeyBase)}
      VAULT_ENC_KEY: ${composeYamlSingleQuoted(pool.vaultEncKey)}
      DATABASE_URL: ${composeYamlSingleQuoted(pool.ectoMetadataUrl)}
      CLUSTER_POSTGRES: "false"
      DB_POOL_SIZE: "5"
      POOLER_TENANT_ID: ${composeYamlSingleQuoted(opts.ref)}
      POOLER_DEFAULT_POOL_SIZE: "15"
      POOLER_MAX_CLIENT_CONN: "${poolerMaxClientConn}"
      POOLER_POOL_MODE: transaction
      TENANT_POOLER_AUX_DB_PASSWORD: ${composeYamlSingleQuoted(pool.auxDbPassword)}
    configs:
      - source: ${cfgName}
        target: /etc/pooler/pooler.exs
    command:
      - /bin/sh
      - -c
      - ${composeYamlSingleQuoted(
          '/app/bin/migrate && /app/bin/supavisor eval "$$(cat /etc/pooler/pooler.exs)" && /app/bin/server'
        )}
    healthcheck:
      test: ["CMD", "curl", "-sSfL", "--head", "-o", "/dev/null", "http://127.0.0.1:4000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 40s
`
      : ''

  const poolerConfigsBlock =
    pool && opts.ports.pooler != null && cfgName
      ? `
configs:
  ${cfgName}:
    content: |
${indentLinesForComposeConfig(pool.exsBody, '      ')}
`
      : ''

  return `# Generated by Studio — per-project data plane (PostgREST, GoTrue, Storage, Realtime, Functions, Imgproxy)
name: indobase-tenant-${opts.ref}

services:
  tenant-rest:
    image: postgrest/postgrest:v14.5
    restart: unless-stopped
    mem_limit: ${pgrstMem}
    networks:
      - tenant_data_plane
    environment:
      PGRST_DB_URI: ${restUri}
      PGRST_DB_SCHEMAS: public,storage,graphql_public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${jwt}
      PGRST_DB_POOL: "${pgrstPool}"
      PGRST_DB_POOL_ACQUISITION_TIMEOUT: "${pgrstPoolAcquire}"
      PGRST_DB_POOL_MAX_IDLETIME: "${pgrstPoolIdle}"
      PGRST_DB_MAX_ROWS: "${pgrstMaxRows}"
    ports:
      - ${composePortBinding(opts.ports.rest, 3000)}

  tenant-auth:
    image: supabase/gotrue:v2.186.0
    restart: unless-stopped
    networks:
      - tenant_data_plane
    environment:
      API_EXTERNAL_URL: ${apiEx}
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: "9999"
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: ${authUri}
      GOTRUE_SITE_URL: ${site}
      GOTRUE_URI_ALLOW_LIST: ${allow}
      GOTRUE_JWT_SECRET: ${jwt}
${opts.gotrueJwtKeys ? `      GOTRUE_JWT_KEYS: ${composeYamlSingleQuoted(opts.gotrueJwtKeys)}\n` : ''}      GOTRUE_JWT_EXP: "3600"
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_DISABLE_SIGNUP: "false"
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
      GOTRUE_EXTERNAL_PHONE_ENABLED: "true"
      GOTRUE_MAILER_AUTOCONFIRM: ${mailer.autoConfirm}
      GOTRUE_MAILER_EXTERNAL_HOSTS: ${mailer.externalHosts}
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_INVITE: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_RECOVERY: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: /auth/v1/verify
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: http://indobase-templates-server/tenant-confirmation.html
      GOTRUE_MAILER_TEMPLATES_RECOVERY: http://indobase-templates-server/tenant-recovery.html
      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: http://indobase-templates-server/tenant-magic-link.html
      GOTRUE_MAILER_TEMPLATES_INVITE: http://indobase-templates-server/tenant-invite.html
      GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: http://indobase-templates-server/tenant-email-change.html
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: Confirm your Indobase account
      GOTRUE_MAILER_SUBJECTS_RECOVERY: Reset your Indobase password
      GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: Your Indobase sign-in link
      GOTRUE_MAILER_SUBJECTS_INVITE: You are invited to Indobase
      GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE: Confirm your new Indobase email
      GOTRUE_MAILER_OTP_LENGTH: "6"
      GOTRUE_MAILER_OTP_EXP: "3600"
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: "true"
      GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: "10"
      GOTRUE_SECURITY_REFRESH_TOKEN_ALLOW_REUSE: "false"
      GOTRUE_SECURITY_REFRESH_TOKEN_ALGORITHM_VERSION: "2"
      GOTRUE_SECURITY_REFRESH_TOKEN_UPGRADE_PERCENTAGE: "100"
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: ${googleEnabled}
      GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${googleClientId}
      GOTRUE_EXTERNAL_GOOGLE_SECRET: ${googleSecret}
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${googleRedirectUri}
      GOTRUE_SMTP_HOST: ${mailer.smtpHost}
      GOTRUE_SMTP_PORT: ${mailer.smtpPort}
      GOTRUE_SMTP_USER: ${mailer.smtpUser}
      GOTRUE_SMTP_PASS: ${mailer.smtpPass}
      GOTRUE_SMTP_ADMIN_EMAIL: ${mailer.smtpAdminEmail}
      GOTRUE_SMTP_SENDER_NAME: ${mailer.smtpSenderName}
    ports:
      - ${composePortBinding(opts.ports.auth, 9999)}

  tenant-imgproxy:
    image: darthsim/imgproxy:v3.30.1
    restart: unless-stopped
    networks:
      - tenant_data_plane
    volumes:
      - tenant-storage-${opts.ref}:/var/lib/storage:Z
    environment:
      IMGPROXY_BIND: ":5001"
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /
      IMGPROXY_USE_ETAG: "true"
      IMGPROXY_ENABLE_WEBP_DETECTION: "true"
      IMGPROXY_MAX_SRC_RESOLUTION: "16.8"
      IMGPROXY_DOWNLOAD_BUFFER_SIZE: "${imgproxyBuf}"
      IMGPROXY_READ_REQUEST_TIMEOUT: "${imgproxyDlTimeout}"
    expose:
      - "5001"

  tenant-storage:
    image: supabase/storage-api:v1.37.8
    restart: unless-stopped
    depends_on:
      tenant-rest:
        condition: service_started
      tenant-imgproxy:
        condition: service_started
    networks:
      - tenant_data_plane
    environment:
      ANON_KEY: ${anon}
      SERVICE_KEY: ${svc}
      POSTGREST_URL: http://tenant-rest:3000
      PGRST_JWT_SECRET: ${jwt}
      DATABASE_URL: ${storageUri}
      REQUEST_ALLOW_X_FORWARDED_PATH: "true"
      FILE_SIZE_LIMIT: "${storageFileLimit}"
      STORAGE_BACKEND: file
      GLOBAL_S3_BUCKET: ${bucket}
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: ${tenantId}
      REGION: local
      ENABLE_IMAGE_TRANSFORMATION: "true"
      IMGPROXY_URL: http://${imgproxyHost}:5001
      VECTOR_ENABLED: "true"
      VECTOR_BUCKET_PROVIDER: pgvector
      VECTOR_STORE_MIGRATIONS_ENABLED: "true"
    volumes:
      - tenant-storage-${opts.ref}:/var/lib/storage:Z
    ports:
      - ${composePortBinding(opts.ports.storage, 5000)}
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:5000/status"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s

  tenant-realtime:
    container_name: ${opts.ref}.indobase-realtime
    image: supabase/realtime:v2.76.5
    restart: unless-stopped
    networks:
      - tenant_data_plane
    environment:
      PORT: "4000"
      DB_HOST: ${rtHost}
      DB_PORT: ${rtPort}
      DB_USER: ${rtUser}
      DB_PASSWORD: ${rtPass}
      DB_NAME: ${rtName}
      DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime'
      DB_ENC_KEY: ${rtEnc}
      API_JWT_SECRET: ${jwt}
      SECRET_KEY_BASE: ${rtSkb}
      ERL_AFLAGS: -proto_dist inet_tcp
      DNS_NODES: "''"
      RLIMIT_NOFILE: "${rtNofile}"
      APP_NAME: realtime
      SEED_SELF_HOST: "true"
      RUN_JANITOR: "true"
      DISABLE_HEALTHCHECK_LOGGING: "true"
      DB_POOL_SIZE: "${rtDbPool}"
    ports:
      - ${composePortBinding(opts.ports.realtime, 4000)}
    healthcheck:
      test: ["CMD", "curl", "-sSf", "http://127.0.0.1:4000/"]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 40s

  tenant-functions:
    image: supabase/edge-runtime:v1.67.1
    restart: unless-stopped
    mem_limit: ${edgeMem}
    depends_on:
      tenant-rest:
        condition: service_started
    networks:
      - tenant_data_plane
    environment:
      JWT_SECRET: ${jwt}
      SUPABASE_URL: ${supabaseUrl}
      SUPABASE_ANON_KEY: ${anon}
      SUPABASE_SERVICE_ROLE_KEY: ${svc}
      VERIFY_JWT: "false"${edgeFunctionSecretsBlock}
    volumes:
${functionsVolumeYaml}
    command:
      - start
      - --main-service
      - /home/deno/functions/main
    ports:
      - ${composePortBinding(opts.ports.functions, 9000)}

  tenant-site:
    image: nginx:1.27-alpine
    restart: unless-stopped
    networks:
      - tenant_data_plane
    volumes:
      - ./site:/usr/share/nginx/html:ro
      - ./site-nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - ${composePortBinding(opts.ports.site, 8080)}${poolerServiceBlock}${poolerConfigsBlock}
networks:
  tenant_data_plane:
    external: true
    name: ${net}

volumes:
  tenant-storage-${opts.ref}:
${useBindMountFunctions ? '' : `  tenant-functions-${opts.ref}:\n`}
`
}

function traefikUpstreamHost(): string {
  const fromEnv = process.env.TRAEFIK_UPSTREAM_HOST?.trim()
  if (fromEnv) return fromEnv
  // Dokploy/Traefik runs in Docker; tenant ports must be reachable on the docker bridge (not 127.0.0.1 inside Traefik).
  return '172.17.0.1'
}

async function loadOccupiedDataPlanePortBases(excludeProjectId?: number): Promise<number[]> {
  const result = await executeQuery<{ data_plane_port_base: number }>({
    query: excludeProjectId
      ? `
        select data_plane_port_base
        from saas.projects
        where data_plane_port_base is not null and id <> $1
      `
      : `
        select data_plane_port_base
        from saas.projects
        where data_plane_port_base is not null
      `,
    parameters: excludeProjectId ? [excludeProjectId] : undefined,
  })
  if (result.error) throw result.error
  return (result.data ?? [])
    .map((row) => row.data_plane_port_base)
    .filter((base): base is number => Number.isFinite(base) && base > 0)
}

async function allocateDataPlanePortBase(projectRef: string, excludeProjectId?: number): Promise<number> {
  const occupied = await loadOccupiedDataPlanePortBases(excludeProjectId)
  return resolveDataPlanePortBase(projectRef, occupied)
}

function composePortBinding(hostPort: number, containerPort: number): string {
  return `"${traefikUpstreamHost()}:${hostPort}:${containerPort}"`
}

function buildSlimTenantTraefikYml(opts: {
  ref: string
  publicDomain: string
  ports: { rest: number; auth: number; storage: number; realtime: number; functions: number; site: number }
}): string {
  const upstream = traefikUpstreamHost()
  const hostRule = `${opts.ref}.${opts.publicDomain}`
  const ref = opts.ref
  const strip = (name: string, prefix: string) => `    tenant-${ref}-${name}-strip:
      stripPrefix:
        prefixes:
          - "${prefix}"
`
  const apiRouter = (name: string, prefix: string) => `    tenant-${ref}-${name}:
      rule: Host(\`${hostRule}\`) && PathPrefix(\`${prefix}\`)
      priority: 100
      middlewares:
        - tenant-${ref}-${name}-strip
      service: tenant-${ref}-${name}
      entryPoints: [web, websecure]
`
  return `# Generated by Studio — per-project routing (REST, Auth, Storage, Realtime, Functions, Site)
http:
  middlewares:
${strip('rest', '/rest/v1')}${strip('auth', '/auth/v1')}${strip('storage', '/storage/v1')}${strip('s3', '/s3')}${strip('realtime', '/realtime/v1')}${strip('functions', '/functions/v1')}
  routers:
${apiRouter('rest', '/rest/v1')}${apiRouter('auth', '/auth/v1')}${apiRouter('storage', '/storage/v1')}${apiRouter('s3', '/s3')}${apiRouter('realtime', '/realtime/v1')}${apiRouter('functions', '/functions/v1')}    tenant-${ref}-site:
      rule: Host(\`${hostRule}\`)
      priority: 1
      service: tenant-${ref}-site
      entryPoints: [web, websecure]

  services:
    tenant-${opts.ref}-rest:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.rest}" }]
        passHostHeader: true
    tenant-${opts.ref}-auth:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.auth}" }]
        passHostHeader: true
    tenant-${opts.ref}-storage:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.storage}" }]
        passHostHeader: true
    tenant-${opts.ref}-realtime:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.realtime}" }]
        passHostHeader: true
    tenant-${opts.ref}-functions:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.functions}" }]
        passHostHeader: true
    tenant-${ref}-site:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.site}" }]
        passHostHeader: true
`
}

export async function getTenantStackArtifacts({
  claims,
  ref,
  publicDomain,
}: {
  claims: Claims
  ref: string
  publicDomain: string
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const row = await executeQuery<{
    id: number
    ref: string
    data_plane_port_base: number | null
    connection_string: string | null
    connection_string_enc: string | null
    jwt_secret_enc: string | null
    service_key: string
    anon_key: string
    service_key_enc: string | null
    anon_key_enc: string | null
    data_plane_last_provisioned_at: string | null
    data_plane_last_provision_result: unknown | null
    data_plane_mode: string
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.data_plane_port_base,
        p.connection_string,
        p.connection_string_enc,
        p.jwt_secret_enc,
        p.service_key,
        p.anon_key,
        p.service_key_enc,
        p.anon_key_enc,
        p.data_plane_last_provisioned_at,
        p.data_plane_last_provision_result,
        p.data_plane_mode
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer')
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  const rows = row.data ?? []
  if (rows.length === 0) return null

  const p = rows[0]!
  const dataPlaneMode = normalizeDataPlaneMode(p.data_plane_mode)
  const jwtSecret = resolveProjectJwtSecret(p.jwt_secret_enc)

  const connectionStringEnc = (p.connection_string_enc ?? '').trim()
  const tenantDbUrl = connectionStringEnc.length > 0 ? decryptString(connectionStringEnc) : p.connection_string

  if (!tenantDbUrl?.trim()) {
    return null
  }

  const anonKeyEnc = (p.anon_key_enc ?? '').trim()
  const anonKey = anonKeyEnc.length > 0 ? decryptString(anonKeyEnc) : p.anon_key
  const serviceKeyEnc = (p.service_key_enc ?? '').trim()
  const serviceKey = serviceKeyEnc.length > 0 ? decryptString(serviceKeyEnc) : p.service_key

  let base = p.data_plane_port_base ?? 0
  const occupiedBases = await loadOccupiedDataPlanePortBases(p.id)
  if (!Number.isFinite(base) || base < 1024 || !isDataPlanePortBaseAvailable(base, occupiedBases)) {
    base = resolveDataPlanePortBase(p.ref, occupiedBases)
    const persist = await executeQuery({
      query: `
        update saas.projects p
        set data_plane_port_base = $1
        from saas.organization_members m
        where p.id = $2
          and m.organization_id = p.organization_id
          and m.gotrue_id = $3
      `,
      parameters: [base, p.id, gotrueId],
      actorId: gotrueId,
    })
    if (persist.error) throw persist.error
  }

  const domain = (publicDomain || resolvePublicDomainForTenantStack()).trim() || 'localhost'
  const tls = domain !== 'localhost' && domain !== '127.0.0.1'
  const sharedGateway = dataPlaneMode === 'shared_gateway'
  const apiExternalUrl = sharedGateway
    ? resolveSharedGatewayPublicApiUrl()
    : `${tls ? 'https' : 'http'}://${p.ref}.${domain}`
  const origin = apiExternalUrl
  const embedPooler = process.env.SAAS_TENANT_EMBED_SUPAVISOR === 'true'
  const ports: {
    rest: number
    auth: number
    storage: number
    realtime: number
    functions: number
    site: number
    pooler?: number
  } = {
    rest: base + 1,
    auth: base + 2,
    storage: base + 3,
    realtime: base + 4,
    functions: base + 5,
    site: base + 7,
  }
  if (embedPooler) {
    ports.pooler = base + 6
  }

  const normalizedTenantUrl = tenantDbUrl.trim().replace(/^postgres:\/\//, 'postgresql://')
  const dbUrl = new URL(normalizedTenantUrl)
  const tenantConnPass = dbUrl.password ? decodeURIComponent(dbUrl.password) : ''
  const auxDbPass =
    process.env.SAAS_DATA_PLANE_AUX_ROLE_PASSWORD?.trim() || tenantConnPass || ''

  const restDbUri = postgresUrlWithDbRole(normalizedTenantUrl, 'authenticator', auxDbPass)
  const authDbUri = postgresUrlWithDbRole(normalizedTenantUrl, 'supabase_auth_admin', auxDbPass)
  const storageDbUri = postgresUrlWithDbRole(
    normalizedTenantUrl,
    'supabase_storage_admin',
    auxDbPass
  )

  const realtimeSecretKeyBase = Buffer.concat([
    crypto.createHmac('sha384', jwtSecret).update(`rt:skb1:${p.ref}`).digest(),
    crypto.createHmac('sha384', jwtSecret).update(`rt:skb2:${p.ref}`).digest(),
  ])
    .toString('base64')
    .slice(0, 128)
  // Realtime AES-128-ECB requires exactly 16 bytes (not 24 hex chars).
  const realtimeDbEncKey = crypto
    .createHmac('sha256', jwtSecret)
    .update(`rt:dbenc:${p.ref}`)
    .digest('hex')
    .slice(0, 16)

  const adminMetaJdbc = postgresUrlWithDbRole(normalizedTenantUrl, 'supabase_admin', auxDbPass)
  const poolerCompose =
    embedPooler && ports.pooler != null
      ? {
          ectoMetadataUrl: postgresJdbcUrlToEcto(adminMetaJdbc),
          exsBody: buildTenantSupavisorPoolerExs({
            ref: p.ref,
            dbHost: dbUrl.hostname,
            dbPort: dbUrl.port || '5432',
            dbName: dbUrl.pathname.replace(/^\//, '') || 'postgres',
          }),
          secretKeyBase: crypto.createHmac('sha512', jwtSecret).update(`pool:skb:${p.ref}`).digest('base64'),
          vaultEncKey: crypto.createHash('sha256').update(`${jwtSecret}:vault:${p.ref}`).digest('hex').slice(0, 32),
          auxDbPassword: auxDbPass,
        }
      : null

  let gotrueJwtKeys: string | null = null
  try {
    gotrueJwtKeys = await buildGotrueJwtKeysJson(p.ref)
  } catch {
    gotrueJwtKeys = null
  }

  const { loadEdgeFunctionSecretsForCompose } = await import('./edge-function-secrets')
  const edgeFunctionSecrets = await loadEdgeFunctionSecretsForCompose(p.ref)

  const dockerComposeYml = repairKnownTenantComposeYaml(
    buildSlimTenantDockerCompose({
    ref: p.ref,
    ports: {
      rest: ports.rest,
      auth: ports.auth,
      storage: ports.storage,
      realtime: ports.realtime,
      functions: ports.functions,
      site: ports.site,
      ...(ports.pooler != null ? { pooler: ports.pooler } : {}),
    },
    restDbUri,
    authDbUri,
    storageDbUri,
    jwtSecret,
    gotrueJwtKeys,
    anonKey,
    serviceKey,
    apiExternalUrl: origin,
    siteUrl: sharedGateway ? origin : origin,
    uriAllowList: sharedGateway ? `${origin},${tls ? 'https' : 'http'}://${p.ref}.${domain}` : origin,
    realtime: {
      dbHost: dbUrl.hostname,
      dbPort: dbUrl.port || '5432',
      dbName: dbUrl.pathname.replace(/^\//, ''),
      dbUser: 'supabase_admin',
      dbPassword: auxDbPass,
      secretKeyBase: realtimeSecretKeyBase,
      dbEncKey: realtimeDbEncKey,
    },
    pooler: poolerCompose,
    edgeFunctionSecrets,
    })
  )
  assertValidTenantComposeYaml(dockerComposeYml)

  const traefikYml = sharedGateway
    ? ''
    : buildSlimTenantTraefikYml({
        ref: p.ref,
        publicDomain: domain,
        ports: {
          rest: ports.rest,
          auth: ports.auth,
          storage: ports.storage,
          realtime: ports.realtime,
          functions: ports.functions,
          site: ports.site,
        },
      })

  const poolerHostEnv = process.env.SAAS_TENANT_POOLER_HOST?.trim()
  const tenant_pooler = poolerHostEnv
    ? { host: poolerHostEnv, port: parseInt(process.env.SAAS_TENANT_POOLER_PORT || '6543', 10) }
    : embedPooler && !sharedGateway
      ? { host: `${p.ref}.${domain}`, port: 6543 }
      : null

  return {
    project_ref: p.ref,
    public_domain: domain,
    data_plane_mode: dataPlaneMode,
    tenant_api_url: sharedGateway ? apiExternalUrl : origin,
    tenant_pooler,
    data_plane_port_base: base,
    data_plane_last_provisioned_at: p.data_plane_last_provisioned_at,
    data_plane_last_provision_result: p.data_plane_last_provision_result,
    ports,
    docker_compose_yml: dockerComposeYml,
    traefik_yml: traefikYml,
  }
}

export async function recordDataPlaneProvisionSuccess({
  claims,
  ref,
  provisionResult,
}: {
  claims: Claims
  ref: string
  provisionResult: Record<string, unknown>
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const r = await executeQuery({
    query: `
      update saas.projects p
      set
        data_plane_last_provisioned_at = now(),
        data_plane_last_provision_result = $1::jsonb
      from saas.organization_members m
      where p.ref = $2
        and m.organization_id = p.organization_id
        and m.gotrue_id = $3
        and m.role in ('owner', 'admin', 'developer')
    `,
    parameters: [JSON.stringify(provisionResult), ref, gotrueId],
    actorId: gotrueId,
  })
  if (r.error) throw r.error
}

export async function recordDataPlaneProvisionFailure({
  claims,
  ref,
  error,
  reason,
}: {
  claims: Claims
  ref: string
  error: unknown
  reason?: string
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const message = error instanceof Error ? error.message : String(error)
  const r = await executeQuery({
    query: `
      update saas.projects p
      set data_plane_last_provision_result = $1::jsonb
      from saas.organization_members m
      where p.ref = $2
        and m.organization_id = p.organization_id
        and m.gotrue_id = $3
        and m.role in ('owner', 'admin', 'developer')
    `,
    parameters: [
      JSON.stringify({
        ok: false,
        reason: reason ?? 'provision_failed',
        error: message.slice(0, 500),
        at: new Date().toISOString(),
      }),
      ref,
      gotrueId,
    ],
    actorId: gotrueId,
  })
  if (r.error) throw r.error
}

/** Cron / fleet repair: update provision result without org membership checks. */
export async function recordDataPlaneProvisionResultForSystem({
  ref,
  provisionResult,
}: {
  ref: string
  provisionResult: Record<string, unknown>
}) {
  await ensureSaasTables()
  const setProvisionedAt = provisionResult.ok === true ? ', data_plane_last_provisioned_at = now()' : ''
  const r = await executeQuery({
    query: `
      update saas.projects
      set data_plane_last_provision_result = $1::jsonb${setProvisionedAt}
      where ref = $2
    `,
    parameters: [JSON.stringify(provisionResult), ref],
  })
  if (r.error) throw r.error
}

export async function updateProject({
  claims,
  ref,
  updates,
}: {
  claims: Claims
  ref: string
  updates: { name?: string | null; connection_string?: string | null }
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const setParts: string[] = []
  const parameters: unknown[] = []
  let i = 1
  const isUpdatingConnectionString = 'connection_string' in updates

  if ('name' in updates) {
    setParts.push(`name = coalesce($${i++}, p.name)`)
    parameters.push(updates.name ?? null)
  }
  if ('connection_string' in updates) {
    const raw = updates.connection_string
    const normalized =
      raw == null || (typeof raw === 'string' && raw.trim() === '') ? null : String(raw).trim()
    // Encrypted-at-rest storage: stop writing plaintext.
    setParts.push(`connection_string = null`)
    setParts.push(`connection_string_enc = $${i++}`)
    parameters.push(normalized ? encryptString(normalized) : null)
  }

  if (!setParts.length) {
    const current = await executeQuery<{ id: number; ref: string; name: string }>({
      query: `
        select p.id, p.ref, p.name
        from saas.projects p
        join saas.organization_members m on m.organization_id = p.organization_id
        where m.gotrue_id = $1 and p.ref = $2
        limit 1
      `,
      parameters: [gotrueId, ref],
      actorId: gotrueId,
    })
    if (current.error) throw current.error
    if (!current.data?.length) return null
    const p = current.data[0]
    return { id: p.id, ref: p.ref, name: p.name }
  }

  const access = await executeQuery<{ organization_id: number }>({
    query: `
      select p.organization_id
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where m.gotrue_id = $1 and p.ref = $2
      limit 1
    `,
    parameters: [gotrueId, ref],
    actorId: gotrueId,
  })
  if (access.error) throw access.error
  if (!access.data?.length) return null
  await assertOrganizationNotPlatformSuspendedById(access.data[0].organization_id, gotrueId)

  const ownerIdx = i++
  const refIdx = i++
  parameters.push(gotrueId, ref)

  const updated = await executeQuery<{
    id: number
    ref: string
    name: string
  }>({
    query: `
      update saas.projects p
      set ${setParts.join(', ')}
      where exists (
        select 1
        from saas.organization_members m
        where m.organization_id = p.organization_id
          and m.gotrue_id = $${ownerIdx}
          and m.role in (${isUpdatingConnectionString ? "'owner','admin'" : "'owner','admin','developer'"})
      )
        and p.ref = $${refIdx}
      returning p.id, p.ref, p.name
    `,
    parameters,
    actorId: gotrueId,
  })

  if (updated.error) throw updated.error
  if (!updated.data?.length) return null

  const p = updated.data[0]
  return { id: p.id, ref: p.ref, name: p.name }
}

export async function deleteProject({ claims, ref }: { claims: Claims; ref: string }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const deleted = await executeQuery<{
    id: number
    name: string
    ref: string
    organization_id: number
  }>({
    query: `
      delete from saas.projects p
      where exists (
        select 1
        from saas.organization_members m
        where m.organization_id = p.organization_id
          and m.gotrue_id = $1
          and m.role in ('owner','admin')
      )
        and p.ref = $2
      returning p.id, p.name, p.ref, p.organization_id
    `,
    parameters: [gotrueId, ref],
    actorId: gotrueId,
  })

  if (deleted.error) throw deleted.error
  const row = deleted.data?.[0]

  if (row) {
    await recordAuditLog({
      claims,
      organizationId: row.organization_id,
      projectRef: row.ref,
      action: 'project.delete',
      targetType: 'project',
      targetDescription: `Project "${row.name}" (${row.ref})`,
      metadata: { project_id: row.id },
    })
  }

  return row ?? null
}

export async function listOrganizationProjects({
  claims,
  slug,
  limit,
  offset,
  statuses,
  search,
}: {
  claims: Claims
  slug: string
  limit?: number
  offset?: number
  statuses?: string[] | undefined
  search?: string | undefined
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const qLimit = Math.min(Math.max(limit ?? 100, 1), 200)
  const qOffset = Math.max(offset ?? 0, 0)
  const qSearch = search?.trim()

  // Minimal filtering: ignore `statuses` for now (frontend uses it, but it isn't essential for CRUD).
  const baseWhere = `o.slug = $1 and m.gotrue_id = $2 and p.is_branch = false`

  const countParams: any[] = [slug, gotrueId]
  const countWhere = qSearch
    ? `${baseWhere} and (p.name ilike '%' || $3 || '%' or p.ref ilike '%' || $3 || '%')`
    : baseWhere
  if (qSearch) countParams.push(qSearch)

  const count = await executeQuery<{ count: string }>({
    query: `
      select count(*)::text as count
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      join saas.organization_members m on m.organization_id = o.id
      where ${countWhere}
    `,
    parameters: countParams,
    actorId: gotrueId,
  })
  if (count.error) throw count.error

  const params: any[] = [...countParams, qLimit, qOffset]
  // Parameter indices for limit/offset depend on whether `$3` exists.
  const limitIndex = qSearch ? 4 : 3
  const offsetIndex = qSearch ? 5 : 4

  const projects = await executeQuery<{
    id: number
    ref: string
    name: string
    organization_id: number
    organization_slug: string
    cloud_provider: string
    region: string
    status: string
    inserted_at: string | null
    is_branch: boolean
    preview_branch_refs: string[]
    has_dedicated_database: boolean
    data_plane_last_provisioned_at: string | null
    data_plane_last_provision_ok: string | null
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.name,
        p.organization_id,
        p.organization_slug,
        p.cloud_provider,
        p.region,
        p.status,
        p.inserted_at,
        p.is_branch,
        p.preview_branch_refs,
        (coalesce(trim(p.connection_string_enc), '') <> '' or coalesce(trim(p.connection_string), '') <> '') as has_dedicated_database,
        p.data_plane_last_provisioned_at,
        (p.data_plane_last_provision_result->>'ok') as data_plane_last_provision_ok
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      join saas.organization_members m on m.organization_id = o.id
      where ${countWhere}
      order by p.name asc
      limit $${limitIndex} offset $${offsetIndex}
    `,
    parameters: params,
    actorId: gotrueId,
  })
  if (projects.error) throw projects.error

  return {
    pagination: {
      count: parseInt(count.data?.[0]?.count ?? '0', 10),
      limit: qLimit,
      offset: qOffset,
    },
    projects: (projects.data ?? []).map((p) => ({
      cloud_provider: p.cloud_provider,
      databases: [
        {
          cloud_provider: p.cloud_provider,
          identifier: p.ref,
          region: p.region,
          status: p.status as any,
          type: 'PRIMARY',
        },
      ],
      inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : new Date(0).toISOString(),
      is_branch: p.is_branch,
      name: p.name,
      ref: p.ref,
      region: p.region,
      status: p.status as any,
      has_dedicated_database: p.has_dedicated_database,
      data_plane_last_provisioned_at: p.data_plane_last_provisioned_at
        ? new Date(p.data_plane_last_provisioned_at).toISOString()
        : null,
      data_plane_last_provision_ok:
        p.data_plane_last_provision_ok === 'true'
          ? true
          : p.data_plane_last_provision_ok === 'false'
            ? false
            : null,
    })),
  }
}

export {
  resolvePublicDomainForTenantStack,
  resolveSaaSTenantApiBaseUrl,
  resolveSaaSTenantRestUrls,
  usesTenantPublicApiHost,
} from './tenant-public-urls'
