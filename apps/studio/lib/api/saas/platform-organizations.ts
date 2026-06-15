import type { JwtPayload } from '@indobaseinc/indobase-js'

import crypto from 'node:crypto'

import { executeQuery } from './query'
import { decryptString, encryptString, encryptedConnectionForPgMeta } from './util'
import { makeRandomString } from 'lib/helpers'
import { PROJECT_ENDPOINT, PROJECT_REST_URL } from 'lib/constants/api'
import { recordAuditLog } from './audit'
import {
  createRazorpaySubscriptionCheckout,
  ensureRazorpayCustomer,
  isRazorpayConfigured,
} from './razorpay-billing'
import {
  type Claims,
  assertOrganizationNotPlatformSuspendedById,
  assertOrganizationNotPlatformSuspendedBySlug,
  getGotrueUserId,
  getPrimaryEmail,
  getUsernameFromEmail,
  normalizePlanId,
  PLAN_NAME,
  slugify,
  uniqueProjectRef,
  uniqueSlug,
} from './platform-shared'
import { ensureSaasTables } from './platform-schema'
import { linkConsentsToGotrueId } from './data-principal'

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
    await linkConsentsToGotrueId({ email: row.primary_email, gotrueId })
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
  await linkConsentsToGotrueId({ email: row.primary_email, gotrueId })
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
    const code = (inserted.error as { code?: string }).code
    if (code === '23505' && body.kind === 'PERSONAL') {
      throw new Error('You already have a personal organization. Choose another type or use your existing org.')
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

