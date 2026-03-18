import type { JwtPayload } from '@supabase/supabase-js'

import { executeQuery } from './query'
import { encryptString } from './util'
import { makeRandomString } from 'lib/helpers'
import { PROJECT_ENDPOINT, PROJECT_REST_URL } from 'lib/constants/api'
import { getConnectionString } from './util'

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
  // GoTrue uses `sub` as the stable user id.
  const id = claims.sub ?? claims.user_id ?? claims.gotrue_id
  if (typeof id !== 'string' || !id) throw new Error('Missing gotrue user id in JWT claims')
  return id
}

function getPrimaryEmail(claims: Claims): string {
  // JWT claims typically include `email`.
  const email = claims.email ?? claims.user_metadata?.email ?? claims.user_metadata?.primary_email
  if (typeof email === 'string' && email) return email
  // Fallback so the API never explodes; UI can still handle missing email.
  return claims.sub ? `${claims.sub}@localhost` : 'unknown@example.com'
}

function getUsernameFromEmail(email: string) {
  const base = email.split('@')[0]
  return slugify(base) || `user-${makeRandomString(6).toLowerCase()}`
}

async function ensurePlatformTables() {
  await executeQuery({
    query: `
      create schema if not exists platform;

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

      create table if not exists platform.organizations (
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
        on platform.organizations (owner_gotrue_id);

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
        rest_url text not null default '',
        db_host text not null default '127.0.0.1',
        connection_string text null,
        db_pass_enc text null
      );

      create index if not exists projects_org_slug_idx
        on platform.projects (organization_slug);
    `,
  })
}

export async function getOrCreateProfile(claims: Claims) {
  await ensurePlatformTables()
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
      'select id, gotrue_id, primary_email, username, first_name, last_name, mobile, is_alpha_user, is_sso_user, disabled_features, free_project_limit from platform.profiles where gotrue_id = $1',
    parameters: [gotrueId],
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
      insert into platform.profiles
        (gotrue_id, primary_email, username, first_name, last_name, mobile)
      values
        ($1, $2, $3, null, null, null)
      returning id, gotrue_id, primary_email, username, first_name, last_name, mobile, is_alpha_user, is_sso_user, disabled_features, free_project_limit
    `,
    parameters: [gotrueId, email, username],
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
  await ensurePlatformTables()
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
      'select id, gotrue_id, primary_email, username, first_name, last_name, mobile, is_alpha_user, is_sso_user, disabled_features, free_project_limit from platform.profiles where gotrue_id = $1',
    parameters: [gotrueId],
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
  await ensurePlatformTables()
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
      update platform.profiles
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
  await ensurePlatformTables()
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
      from platform.organizations
      where owner_gotrue_id = $1
      order by name asc
      limit $2 offset $3
    `,
    parameters: [gotrueId, qLimit, qOffset],
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
      is_owner: true,
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

export async function getOrganization({ claims, slug }: { claims: Claims; slug: string }) {
  await ensurePlatformTables()
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
      from platform.organizations
      where slug = $1 and owner_gotrue_id = $2
      limit 1
    `,
    parameters: [slug, gotrueId],
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
  await ensurePlatformTables()
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
      insert into platform.organizations (
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
  })

  if (inserted.error || !inserted.data?.length) throw inserted.error ?? new Error('Failed to create organization')
  const o = inserted.data[0]

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
  await ensurePlatformTables()
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
      update platform.organizations
      set
        name = coalesce($1, name),
        billing_email = coalesce($2, billing_email),
        opt_in_tags = coalesce($3, opt_in_tags),
        updated_at = now()
      where slug = $4 and owner_gotrue_id = $5
      returning id, slug, name, billing_email, opt_in_tags, stripe_customer_id
    `,
    parameters: [updates.name ?? null, updates.billing_email ?? null, updates.opt_in_tags ?? null, slug, gotrueId],
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
  await ensurePlatformTables()
  const gotrueId = getGotrueUserId(claims)

  // Delete projects first so we don't leave orphans.
  await executeQuery({
    query: `delete from platform.projects where organization_slug = $1`,
    parameters: [slug],
  })

  const deleted = await executeQuery<{ slug: string }>({
    query: `delete from platform.organizations where slug = $1 and owner_gotrue_id = $2 returning slug`,
    parameters: [slug, gotrueId],
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
  await ensurePlatformTables()
  const gotrueId = getGotrueUserId(claims)
  const qLimit = Math.min(Math.max(limit ?? 100, 1), 200)
  const qOffset = Math.max(offset ?? 0, 0)
  const qSearch = search?.trim()

  const count = await executeQuery<{ count: string }>({
    query: `
      select count(*)::text as count
      from platform.projects p
      join platform.organizations o on o.id = p.organization_id
      where o.owner_gotrue_id = $1
      ${qSearch ? `and (p.name ilike '%' || $2 || '%' or p.ref ilike '%' || $2 || '%')` : ''}
    `,
    parameters: qSearch ? [gotrueId, qSearch] : [gotrueId],
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
      from platform.projects p
      join platform.organizations o on o.id = p.organization_id
      where o.owner_gotrue_id = $1
      ${qSearch ? `and (p.name ilike '%' || $2 || '%' or p.ref ilike '%' || $2 || '%')` : ''}
      order by p.name asc
      limit $${qSearch ? 3 : 2} offset $${qSearch ? 4 : 3}
    `,
    parameters: qSearch ? [gotrueId, qSearch, qLimit, qOffset] : [gotrueId, qLimit, qOffset],
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
  await ensurePlatformTables()
  const gotrueId = getGotrueUserId(claims)
  const anonKey = process.env.SUPABASE_ANON_KEY ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''

  const orgRows = await executeQuery<{
    id: number
    organization_slug: string
    owner_gotrue_id: string
  }>({
    query: `
      select id, slug as organization_slug, owner_gotrue_id
      from platform.organizations
      where slug = $1 and owner_gotrue_id = $2
      limit 1
    `,
    parameters: [body.organization_slug, gotrueId],
  })
  if (orgRows.error) throw orgRows.error
  if (!orgRows.data?.length) throw new Error('Organization not found')

  const org = orgRows.data[0]
  const ref = uniqueProjectRef(body.name)
  const region = body.db_region || body.region_selection?.code || 'local'

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
      insert into platform.projects (
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
        $1, $2, $3, $4, $5, $6, 'ACTIVE_HEALTHY',
        $7, $8, '',
        $9, '127.0.0.1', null, $10
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
      serviceKey,
      anonKey,
      PROJECT_REST_URL,
      encryptString(body.db_pass),
    ],
  })

  if (inserted.error || !inserted.data?.length) throw inserted.error ?? new Error('Failed to create project')
  const p = inserted.data[0]

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
    status: p.status,
    subscription_id: null,
    inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : null,
    is_branch_enabled: false,
    is_physical_backups_enabled: false,
  }
}

export async function getProject({ claims, ref }: { claims: Claims; ref: string }) {
  await ensurePlatformTables()
  const gotrueId = getGotrueUserId(claims)

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
    preview_branch_refs: string[]
    service_key: string
    anon_key: string
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
        p.anon_key
      from platform.projects p
      join platform.organizations o on o.id = p.organization_id
      where p.ref = $1 and o.owner_gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
  })

  if (rows.error) throw rows.error
  if (!rows.data?.length) return null

  const p = rows.data[0]
  return {
    cloud_provider: p.cloud_provider,
    // pg-meta expects `x-connection-encrypted` header value to be encrypted.
    // The frontend forwards this `connectionString` into that header.
    connectionString: encryptString(getConnectionString({ readOnly: true })),
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

export async function updateProject({
  claims,
  ref,
  updates,
}: {
  claims: Claims
  ref: string
  updates: { name?: string }
}) {
  await ensurePlatformTables()
  const gotrueId = getGotrueUserId(claims)

  const updated = await executeQuery<{
    id: number
    ref: string
    name: string
  }>({
    query: `
      update platform.projects p
      set
        name = coalesce($1, p.name)
      from platform.organizations o
      where o.id = p.organization_id and o.owner_gotrue_id = $2 and p.ref = $3
      returning p.id, p.ref, p.name
    `,
    parameters: [updates.name ?? null, gotrueId, ref],
  })

  if (updated.error) throw updated.error
  if (!updated.data?.length) return null

  const p = updated.data[0]
  return { id: p.id, ref: p.ref, name: p.name }
}

export async function deleteProject({ claims, ref }: { claims: Claims; ref: string }) {
  await ensurePlatformTables()
  const gotrueId = getGotrueUserId(claims)

  const deleted = await executeQuery<{
    id: number
    name: string
    ref: string
  }>({
    query: `
      delete from platform.projects p
      using platform.organizations o
      where o.id = p.organization_id and o.owner_gotrue_id = $1 and p.ref = $2
      returning p.id, p.name, p.ref
    `,
    parameters: [gotrueId, ref],
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
  await ensurePlatformTables()
  const gotrueId = getGotrueUserId(claims)

  const qLimit = Math.min(Math.max(limit ?? 100, 1), 200)
  const qOffset = Math.max(offset ?? 0, 0)
  const qSearch = search?.trim()

  // Minimal filtering: ignore `statuses` for now (frontend uses it, but it isn't essential for CRUD).
  const baseWhere = `o.slug = $1 and o.owner_gotrue_id = $2`

  const countParams: any[] = [slug, gotrueId]
  const countWhere = qSearch
    ? `${baseWhere} and (p.name ilike '%' || $3 || '%' or p.ref ilike '%' || $3 || '%')`
    : baseWhere
  if (qSearch) countParams.push(qSearch)

  const count = await executeQuery<{ count: string }>({
    query: `
      select count(*)::text as count
      from platform.projects p
      join platform.organizations o on o.id = p.organization_id
      where ${countWhere}
    `,
    parameters: countParams,
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
      from platform.projects p
      join platform.organizations o on o.id = p.organization_id
      where ${countWhere}
      order by p.name asc
      limit $${limitIndex} offset $${offsetIndex}
    `,
    parameters: params,
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

