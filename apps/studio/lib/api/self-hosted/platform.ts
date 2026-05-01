import type { JwtPayload } from '@supabase/supabase-js'

import crypto from 'node:crypto'
import { executeQuery } from './query'
import { decryptString, encryptString, encryptedConnectionForPgMeta } from './util'
import { makeRandomString } from 'lib/helpers'
import { IS_PLATFORM, IS_SAAS } from 'lib/constants'
import { PROJECT_ENDPOINT, PROJECT_REST_URL } from 'lib/constants/api'
import { provisionTenantDatabase } from './provision-tenant-db'

type Claims = JwtPayload & Record<string, any>

type PlanId = 'free' | 'pro' | 'team' | 'enterprise' | 'platform'

const PLAN_NAME: Record<PlanId, string> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
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

function getGotrueUserId(claims: Claims): string {
  // In some self-hosted flows, `getUserClaims()` returns a wrapper like:
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

function getPrimaryEmail(claims: Claims): string {
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

async function ensureSaasTables() {
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

      create index if not exists projects_org_slug_idx
        on saas.projects (organization_slug);
    `,
  })
  if (bootstrap.error) {
    throw bootstrap.error
  }
}

/** Stable project ref per GoTrue user for self-hosted (must match client routes). */
export function selfHostedDefaultProjectRef(gotrueUserId: string) {
  return `p-${gotrueUserId}`
}

/**
 * Legacy URLs use `/project/default`; the DB stores `p-<gotrue_sub>`. Resolve for API handlers.
 */
function resolveSelfHostedProjectRef(claims: Claims, ref: string): string {
  if (IS_PLATFORM || ref !== 'default') return ref
  return selfHostedDefaultProjectRef(getGotrueUserId(claims))
}

/**
 * Ensures the user has one free-tier org and a default project (self-hosted only).
 * Idempotent; safe to call from list/get entry points.
 */
export async function ensureSelfHostedDefaultWorkspace(claims: Claims) {
  if (IS_PLATFORM) return

  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const email = getPrimaryEmail(claims)

  // 1. Get or create organization
  let orgRow: { id: number; slug: string } | undefined
  const existingOrgs = await executeQuery<{ id: number; slug: string }>({
    query: `select id, slug from saas.organizations where owner_gotrue_id = $1 order by id asc limit 1`,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (existingOrgs.error) throw existingOrgs.error

  if (existingOrgs.data?.length) {
    orgRow = existingOrgs.data[0]
  } else {
    const orgName =
      (process.env.DEFAULT_ORGANIZATION_NAME || process.env.STUDIO_DEFAULT_ORGANIZATION || 'My workspace').trim() ||
      'My workspace'
    const slug = uniqueSlug(orgName)
    const orgInsert = await executeQuery<{ id: number; slug: string }>({
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
          $1, $2, $3, 'PERSONAL', null, 'free',
          '{}',
          $4,
          null,
          false,
          false,
          null,
          null,
          false,
          null,
          null
        )
        returning id, slug
      `,
      parameters: [gotrueId, slug, orgName, email],
      actorId: gotrueId,
    })
    if (orgInsert.error || !orgInsert.data?.length) throw orgInsert.error ?? new Error('Failed to create default organization')
    orgRow = orgInsert.data[0]
  }

  // Seed owner membership: getProject (and other reads) join on saas.organization_members,
  // so without this row the user appears to "not have access" to their own default project.
  const memberInsert = await executeQuery({
    query: `
      insert into saas.organization_members (organization_id, gotrue_id, role)
      values ($1, $2, 'owner')
      on conflict (organization_id, gotrue_id) do nothing
    `,
    parameters: [orgRow.id, gotrueId],
    actorId: gotrueId,
  })
  if (memberInsert.error) throw memberInsert.error

  // 2. Ensure default project exists for this org
  const projectRef = selfHostedDefaultProjectRef(gotrueId)
  const existingProjects = await executeQuery<{ id: number }>({
    query: `select id from saas.projects where ref = $1`,
    parameters: [projectRef],
    actorId: gotrueId,
  })
  if (existingProjects.error) throw existingProjects.error

  if (!existingProjects.data?.length) {
    const projectName =
      (process.env.DEFAULT_PROJECT_NAME || process.env.STUDIO_DEFAULT_PROJECT || 'Default Project').trim() ||
      'Default Project'

    const anonKey = process.env.SUPABASE_ANON_KEY ?? ''
    const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''

    const projectInsert = await executeQuery({
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
          subscription_id,
          rest_url,
          db_host,
          connection_string,
          db_pass_enc
        ) values (
          $1, $2, $3, $4, 'localhost', 'local', 'ACTIVE_HEALTHY',
          $5, $6, '',
          $7, '127.0.0.1', null, $8
        )
      `,
      parameters: [
        orgRow.id,
        orgRow.slug,
        projectRef,
        projectName,
        serviceKey,
        anonKey,
        PROJECT_REST_URL,
        encryptString(''),
      ],
      actorId: gotrueId,
    })
    if (projectInsert.error) throw projectInsert.error
  }
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
    await ensureSelfHostedDefaultWorkspace(claims)
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
  await ensureSelfHostedDefaultWorkspace(claims)
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
  await ensureSelfHostedDefaultWorkspace(claims)
  const gotrueId = getGotrueUserId(claims)
  const qLimit = Math.min(Math.max(limit ?? 100, 1), 200)
  const qOffset = Math.max(offset ?? 0, 0)

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
      where m.gotrue_id = $1
      order by name asc
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

  const planId = normalizePlanId(body.tier)
  const slug = uniqueSlug(name)

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
    parameters: [gotrueId, slug, name, body.kind ?? null, body.size ?? null, planId, body.billing_name ?? null, email],
    actorId: gotrueId,
  })

  if (inserted.error || !inserted.data?.length) throw inserted.error ?? new Error('Failed to create organization')
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

  return {
    billing_email: o.billing_email,
    billing_partner: (o.billing_partner as any) ?? null,
    id: o.id,
    is_owner: true,
    name: o.name,
    opt_in_tags: o.opt_in_tags ?? [],
    organization_missing_address: o.organization_missing_address,
    organization_requires_mfa: o.organization_requires_mfa,
    plan: { id: planId, name: PLAN_NAME[planId] },
    restriction_data: o.restriction_data ?? null,
    restriction_status: (o.restriction_status as any) ?? null,
    slug: o.slug,
    stripe_customer_id: o.stripe_customer_id,
    subscription_id: o.subscription_id,
    usage_billing_enabled: o.usage_billing_enabled,
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
            and m.gotrue_id = $2
            and m.role = 'owner'
        )
      returning o.slug
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })

  if (deleted.error) throw deleted.error
  return Boolean(deleted.data?.length)
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
  await ensureSelfHostedDefaultWorkspace(claims)
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
    subscription_id: string
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
        p.subscription_id
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where m.gotrue_id = $1
      ${qSearch ? `and (p.name ilike '%' || $2 || '%' or p.ref ilike '%' || $2 || '%')` : ''}
      order by p.name asc
      limit $${qSearch ? 3 : 2} offset $${qSearch ? 4 : 3}
    `,
    parameters: qSearch ? [gotrueId, qSearch, qLimit, qOffset] : [gotrueId, qLimit, qOffset],
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
      id: p.id,
      inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : null,
      is_branch_enabled: p.is_branch,
      is_physical_backups_enabled: false,
      name: p.name,
      organization_id: p.organization_id,
      organization_slug: p.organization_slug,
      preview_branch_refs: p.preview_branch_refs ?? [],
      ref: p.ref,
      region: p.region,
      status: p.status,
      subscription_id: p.subscription_id ?? null,
    })),
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
  const jwtSecret = process.env.AUTH_JWT_SECRET ?? ''
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('Missing/invalid AUTH_JWT_SECRET (must be >= 32 chars) for per-project key generation')
  }

  function base64Url(input: Buffer | string) {
    const buf = typeof input === 'string' ? Buffer.from(input) : input
    return buf
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  }

  function makeProjectJwt(role: 'anon' | 'service_role', projectRef: string) {
    const headerB64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const now = Math.floor(Date.now() / 1000)
    const payloadB64 = base64Url(
      JSON.stringify({
        role,
        iss: 'indobase',
        project_ref: projectRef,
        iat: now,
        exp: now + 60 * 60 * 24 * 365 * 10, // ~10y
      })
    )

    const data = `${headerB64}.${payloadB64}`
    const sig = crypto.createHmac('sha256', jwtSecret).update(data).digest()
    return `${data}.${base64Url(sig)}`
  }

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
  const ref = uniqueProjectRef(body.name)
  const region = body.db_region || body.region_selection?.code || 'local'
  const anonKey = makeProjectJwt('anon', ref)
  const serviceKey = makeProjectJwt('service_role', ref)

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

  // MVP provisioning: create a dedicated tenant DB and store its DSN encrypted-at-rest.
  const pgHost = process.env.TENANT_PG_HOST || process.env.POSTGRES_HOST || 'indobase-db'
  const pgPort = parseInt(process.env.TENANT_PG_PORT || process.env.POSTGRES_PORT || '5432', 10)
  const pgAdminUser = process.env.TENANT_PG_ADMIN_USER || process.env.POSTGRES_USER || 'postgres'
  const pgAdminPassword = process.env.TENANT_PG_ADMIN_PASSWORD || process.env.POSTGRES_PASSWORD || ''
  if (!pgAdminPassword) {
    throw new Error('Missing TENANT_PG_ADMIN_PASSWORD/POSTGRES_PASSWORD for tenant provisioning')
  }

  const provisioned = await provisionTenantDatabase({
    projectRef: p.ref,
    host: pgHost,
    port: Number.isFinite(pgPort) ? pgPort : 5432,
    adminUser: pgAdminUser,
    adminPassword: pgAdminPassword,
  })

  // Deterministic port allocation for per-project isolated data-plane stacks.
  // - The generator uses this base to map localhost ports in Traefik dynamic config.
  // - Convention: rest/auth/storage/realtime/functions map to base+1..base+5.
  // - Keep spacing for future services.
  const dataPlanePortBase = 20000 + p.id * 10

  const saved = await executeQuery({
    query: `
      update saas.projects p
      set connection_string = null,
          connection_string_enc = $1,
          data_plane_port_base = $4,
          status = 'ACTIVE_HEALTHY'
      where p.ref = $2
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = p.organization_id
            and m.gotrue_id = $3
            and m.role in ('owner','admin','developer')
        )
    `,
    parameters: [encryptString(provisioned.connectionString), p.ref, gotrueId, dataPlanePortBase],
    actorId: gotrueId,
  })
  if (saved.error) throw saved.error

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
    status: 'ACTIVE_HEALTHY',
    subscription_id: null,
    inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : null,
    is_branch_enabled: false,
    is_physical_backups_enabled: false,
  }
}

export async function getProject({ claims, ref }: { claims: Claims; ref: string }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const resolvedRef = resolveSelfHostedProjectRef(claims, ref)

  let rows = await executeQuery<{
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
    service_key: string
    anon_key: string
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
        p.is_branch,
        p.preview_branch_refs,
        p.service_key,
        p.anon_key,
        p.connection_string,
        p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [resolvedRef, gotrueId],
    actorId: gotrueId,
  })

  if (rows.error) throw rows.error
  if (!rows.data?.length && !IS_PLATFORM) {
    await ensureSelfHostedDefaultWorkspace(claims)
    const retry = await executeQuery<{
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
      service_key: string
      anon_key: string
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
        p.is_branch,
        p.preview_branch_refs,
        p.service_key,
        p.anon_key,
        p.connection_string,
        p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
      parameters: [resolvedRef, gotrueId],
      actorId: gotrueId,
    })
    if (retry.error) throw retry.error
    rows = retry
  }

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

  // In SaaS mode, every project must point to its own tenant database.
  // Falling back to POSTGRES_* would cause cross-tenant visibility.
  if (IS_SAAS && !tenantDatabaseUrl?.trim()) {
    throw new Error(
      'Project is missing tenant database connection_string. Set saas.projects.connection_string to a tenant Postgres URI.'
    )
  }
  return {
    cloud_provider: p.cloud_provider,
    // pg-meta expects `x-connection-encrypted` header value to be encrypted.
    // The frontend forwards this `connectionString` into that header.
    // Per-tenant DB: plaintext URI in saas.projects.connection_string; else POSTGRES_* fallback.
    connectionString: encryptedConnectionForPgMeta(tenantDatabaseUrl),
    db_host: '127.0.0.1',
    id: p.id,
    inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : new Date(0).toISOString(),
    is_branch_enabled: p.is_branch,
    is_physical_backups_enabled: false,
    name: p.name,
    organization_id: p.organization_id,
    ref: p.ref,
    region: p.region,
    restUrl: PROJECT_REST_URL,
    status: p.status,
    subscription_id: '',
  }
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
  const resolvedRef = resolveSelfHostedProjectRef(claims, ref)

  const jwtSecret = process.env.AUTH_JWT_SECRET ?? process.env.JWT_SECRET ?? ''
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('Missing/invalid AUTH_JWT_SECRET/JWT_SECRET (must be >= 32 chars)')
  }

  const row = await executeQuery<{
    id: number
    ref: string
    data_plane_port_base: number | null
    connection_string: string | null
    connection_string_enc: string | null
    service_key: string
    anon_key: string
    service_key_enc: string | null
    anon_key_enc: string | null
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.data_plane_port_base,
        p.connection_string,
        p.connection_string_enc,
        p.service_key,
        p.anon_key,
        p.service_key_enc,
        p.anon_key_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [resolvedRef, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) return null

  const p = row.data[0]
  const base = p.data_plane_port_base ?? 0
  if (!Number.isFinite(base) || base < 1024) {
    throw new Error('Project is missing data_plane_port_base (re-provision project or set it in saas.projects)')
  }

  const tenantDbUrl =
    p.connection_string_enc && p.connection_string_enc.trim()
      ? decryptString(p.connection_string_enc)
      : p.connection_string

  if (IS_SAAS && !tenantDbUrl?.trim()) {
    throw new Error('Project is missing tenant DB connection_string (cannot render tenant stack)')
  }

  const anonKey = p.anon_key_enc ? decryptString(p.anon_key_enc) : p.anon_key
  const serviceKey = p.service_key_enc ? decryptString(p.service_key_enc) : p.service_key

  const ports = {
    rest: base + 1,
    auth: base + 2,
    storage: base + 3,
    realtime: base + 4,
    functions: base + 5,
  }

  const stablePassword = crypto.createHash('sha256').update(`indobase-tenant-${p.ref}`).digest('hex').slice(0, 24)

  const dockerComposeYml = `# Generated by Studio (Option A per-project stack)
name: indobase-tenant-${p.ref}

services:
  tenant-db:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${stablePassword}
      POSTGRES_DB: postgres
    ports:
      - "127.0.0.1:${base}:5432"
    volumes:
      - tenant-db-${p.ref}:/var/lib/postgresql/data:Z

  tenant-rest:
    image: postgrest/postgrest:v14.5
    restart: unless-stopped
    depends_on: [tenant-db]
    environment:
      PGRST_DB_URI: ${tenantDbUrl?.trim() ?? ''}
      PGRST_DB_SCHEMAS: public,storage,graphql_public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${jwtSecret}
    ports:
      - "127.0.0.1:${ports.rest}:3000"

  tenant-auth:
    image: supabase/gotrue:v2.186.0
    restart: unless-stopped
    depends_on: [tenant-db]
    environment:
      GOTRUE_SITE_URL: https://${p.ref}.${publicDomain}
      GOTRUE_URI_ALLOW_LIST: https://${p.ref}.${publicDomain}
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: ${tenantDbUrl?.trim() ?? ''}
      GOTRUE_JWT_SECRET: ${jwtSecret}
      GOTRUE_JWT_EXP: 3600
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_DISABLE_SIGNUP: "false"
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
      GOTRUE_MAILER_AUTOCONFIRM: "false"
      GOTRUE_SMTP_HOST: supabase-mail
      GOTRUE_SMTP_PORT: 2500
      GOTRUE_SMTP_USER: fake_mail_user
      GOTRUE_SMTP_PASS: fake_mail_password
      GOTRUE_SMTP_ADMIN_EMAIL: admin@example.com
      GOTRUE_SMTP_SENDER_NAME: fake_sender
    ports:
      - "127.0.0.1:${ports.auth}:9999"

  tenant-storage:
    image: supabase/storage-api:v1.23.0
    restart: unless-stopped
    depends_on: [tenant-db, tenant-rest]
    environment:
      ANON_KEY: ${anonKey}
      SERVICE_KEY: ${serviceKey}
      POSTGREST_URL: http://host.docker.internal:${ports.rest}
      PGRST_JWT_SECRET: ${jwtSecret}
      DATABASE_URL: ${tenantDbUrl?.trim() ?? ''}
      FILE_SIZE_LIMIT: 52428800
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      REGION: local
      TENANT_ID: ${p.ref}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - tenant-storage-${p.ref}:/var/lib/storage:Z
    ports:
      - "127.0.0.1:${ports.storage}:5000"

  tenant-realtime:
    image: supabase/realtime:v2.76.5
    restart: unless-stopped
    depends_on: [tenant-db]
    environment:
      PORT: 4000
      DB_HOST: host.docker.internal
      DB_PORT: ${base}
      DB_USER: postgres
      DB_PASSWORD: ${stablePassword}
      DB_NAME: postgres
      DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime'
      JWT_SECRET: ${jwtSecret}
      SECURE_CHANNELS: "true"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "127.0.0.1:${ports.realtime}:4000"

  tenant-functions:
    image: supabase/edge-runtime:v1.67.1
    restart: unless-stopped
    environment:
      SUPABASE_URL: https://${p.ref}.${publicDomain}
      SUPABASE_ANON_KEY: ${anonKey}
      SUPABASE_SERVICE_ROLE_KEY: ${serviceKey}
      SUPABASE_DB_URL: ${tenantDbUrl?.trim() ?? ''}
    volumes:
      - ./volumes/functions:/home/deno/functions:Z
    ports:
      - "127.0.0.1:${ports.functions}:9000"

volumes:
  tenant-db-${p.ref}:
  tenant-storage-${p.ref}:
`

  const traefikYml = `# Generated by Studio (Option A per-project routing)
http:
  routers:
    tenant-${p.ref}-rest:
      rule: Host(\`${p.ref}.${publicDomain}\`) && PathPrefix(\`/rest/v1\`)
      service: tenant-${p.ref}-rest
      entryPoints: [web, websecure]
    tenant-${p.ref}-auth:
      rule: Host(\`${p.ref}.${publicDomain}\`) && PathPrefix(\`/auth/v1\`)
      service: tenant-${p.ref}-auth
      entryPoints: [web, websecure]
    tenant-${p.ref}-storage:
      rule: Host(\`${p.ref}.${publicDomain}\`) && PathPrefix(\`/storage/v1\`)
      service: tenant-${p.ref}-storage
      entryPoints: [web, websecure]
    tenant-${p.ref}-realtime:
      rule: Host(\`${p.ref}.${publicDomain}\`) && PathPrefix(\`/realtime/v1\`)
      service: tenant-${p.ref}-realtime
      entryPoints: [web, websecure]
    tenant-${p.ref}-functions:
      rule: Host(\`${p.ref}.${publicDomain}\`) && PathPrefix(\`/functions/v1\`)
      service: tenant-${p.ref}-functions
      entryPoints: [web, websecure]

  services:
    tenant-${p.ref}-rest:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.rest}" }]
        passHostHeader: true
    tenant-${p.ref}-auth:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.auth}" }]
        passHostHeader: true
    tenant-${p.ref}-storage:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.storage}" }]
        passHostHeader: true
    tenant-${p.ref}-realtime:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.realtime}" }]
        passHostHeader: true
    tenant-${p.ref}-functions:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.functions}" }]
        passHostHeader: true
`

  return {
    project_ref: p.ref,
    public_domain: publicDomain,
    data_plane_port_base: base,
    ports,
    docker_compose_yml: dockerComposeYml,
    traefik_yml: traefikYml,
  }
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
  const resolvedRef = resolveSelfHostedProjectRef(claims, ref)

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
      parameters: [gotrueId, resolvedRef],
      actorId: gotrueId,
    })
    if (current.error) throw current.error
    if (!current.data?.length) return null
    const p = current.data[0]
    return { id: p.id, ref: p.ref, name: p.name }
  }

  const ownerIdx = i++
  const refIdx = i++
  parameters.push(gotrueId, resolvedRef)

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
  const resolvedRef = resolveSelfHostedProjectRef(claims, ref)

  const deleted = await executeQuery<{
    id: number
    name: string
    ref: string
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
      returning p.id, p.name, p.ref
    `,
    parameters: [gotrueId, resolvedRef],
    actorId: gotrueId,
  })

  if (deleted.error) throw deleted.error
  return deleted.data?.[0] ?? null
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
  const baseWhere = `o.slug = $1 and m.gotrue_id = $2`

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
        p.preview_branch_refs
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
    })),
  }
}

