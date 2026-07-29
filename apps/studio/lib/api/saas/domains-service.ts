import type { JwtPayload } from '@indobaseinc/indobase-js'

import { INDOBASE_USD_TO_INR_RATE } from 'lib/billing/compute-pricing'

import {
  checkAvailability,
  getPricingForTld,
  isNamecomConfigured,
  parseDomainParts,
  registerDomain,
  setNameservers,
  type NamecomAvailabilityResult,
} from './namecom-client'
import { executeQuery } from './query'
import { recordAuditLog } from './audit'

type Claims = JwtPayload & Record<string, unknown>

export type DomainRegistrationRow = {
  id: string
  organization_id: number
  project_ref: string | null
  domain_name: string
  tld: string
  status: DomainRegistrationStatus
  years: number
  provider: string
  provider_purchase_price_usd: number | null
  customer_price_inr_paise: number
  razorpay_order_id: string | null
  razorpay_payment_id: string | null
  provider_order_id: string | null
  nameservers: string[] | null
  metadata: Record<string, unknown>
  registered_by_gotrue_id: string
  inserted_at: string
  updated_at: string
  completed_at: string | null
  last_error: string | null
}

export type DomainRegistrationStatus =
  | 'quoted'
  | 'payment_pending'
  | 'paid'
  | 'registering'
  | 'registered'
  | 'failed'
  | 'cancelled'

let ensureDomainTablesPromise: Promise<void> | null = null

export async function ensureDomainTables(): Promise<void> {
  if (!ensureDomainTablesPromise) {
    ensureDomainTablesPromise = ensureDomainTablesOnce().catch((error) => {
      ensureDomainTablesPromise = null
      throw error
    })
  }
  return ensureDomainTablesPromise
}

async function ensureDomainTablesOnce(): Promise<void> {
  const result = await executeQuery({
    query: `
      create table if not exists saas.domain_registrations (
        id uuid primary key default gen_random_uuid(),
        organization_id integer not null references saas.organizations(id) on delete cascade,
        project_ref text null references saas.projects(ref) on delete set null,
        domain_name text not null,
        tld text not null,
        status text not null default 'quoted',
        years integer not null default 1,
        provider text not null default 'namecom',
        provider_purchase_price_usd numeric(12, 2) null,
        customer_price_inr_paise integer not null,
        razorpay_order_id text null,
        razorpay_payment_id text null,
        provider_order_id text null,
        nameservers jsonb null,
        metadata jsonb not null default '{}'::jsonb,
        registered_by_gotrue_id uuid not null,
        inserted_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        completed_at timestamptz null,
        last_error text null,
        constraint domain_registrations_status_check
          check (status in (
            'quoted', 'payment_pending', 'paid', 'registering', 'registered', 'failed', 'cancelled'
          ))
      );

      create index if not exists domain_registrations_org_idx
        on saas.domain_registrations (organization_id, inserted_at desc);
      create index if not exists domain_registrations_project_idx
        on saas.domain_registrations (project_ref, inserted_at desc)
        where project_ref is not null;
      create index if not exists domain_registrations_domain_idx
        on saas.domain_registrations (domain_name);
      create unique index if not exists domain_registrations_active_domain_idx
        on saas.domain_registrations (domain_name)
        where status in ('payment_pending', 'paid', 'registering', 'registered');
    `,
  })
  if (result.error) throw result.error
}

function getActor(claims: Claims | undefined) {
  if (!claims) throw new Error('Missing claims')
  const normalized: Record<string, unknown> =
    claims && typeof (claims as { claims?: unknown }).claims === 'object'
      ? ((claims as { claims: Record<string, unknown> }).claims as Record<string, unknown>)
      : (claims as Record<string, unknown>)
  const id =
    (normalized.sub as string | undefined) ??
    (normalized.id as string | undefined) ??
    (normalized.user_id as string | undefined)
  if (!id) throw new Error('Missing gotrue user id')
  return { id }
}

async function assertProjectMembership(projectRef: string, gotrueId: string) {
  const row = await executeQuery<{ organization_id: number; organization_slug: string }>({
    query: `
      select p.organization_id, p.organization_slug
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [projectRef, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) throw new Error('Project not found or insufficient permissions')
  return row.data[0]
}

function domainMarkupMultiplier(): number {
  const bps = Number(process.env.DOMAINS_PRICE_MARKUP_BPS ?? '1500')
  if (!Number.isFinite(bps) || bps < 0) return 1.15
  return 1 + bps / 10_000
}

function usdToInrPaise(usd: number): number {
  const rate = Number(process.env.DOMAINS_USD_TO_INR_RATE ?? String(INDOBASE_USD_TO_INR_RATE))
  const inr = usd * rate * domainMarkupMultiplier()
  return Math.max(100, Math.round(inr * 100))
}

export function resolveIndobaseDomainNameservers(): string[] {
  const raw =
    process.env.INDOBASE_DOMAIN_NAMESERVERS?.trim() ||
    'ns1.indobase.in,ns2.indobase.in'
  return raw
    .split(',')
    .map((ns) => ns.trim().toLowerCase())
    .filter(Boolean)
}

export type DomainSearchQuote = NamecomAvailabilityResult & {
  customerPriceInrPaise: number | null
  customerPriceInr: number | null
  years: number
}

export async function searchDomainsForProject({
  claims,
  ref,
  queries,
  years = 1,
}: {
  claims: Claims
  ref: string
  queries: string[]
  years?: number
}): Promise<DomainSearchQuote[]> {
  await ensureDomainTables()
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)

  if (!isNamecomConfigured()) {
    throw new Error('Domain registration is not configured on this environment.')
  }

  const domainNames = queries
    .map((q) => q.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50)

  if (!domainNames.length) return []

  const results = await checkAvailability(domainNames)
  return results.map((row) => ({
    ...row,
    years,
    customerPriceInrPaise:
      row.purchasable && row.purchasePrice != null
        ? usdToInrPaise(row.purchasePrice * years)
        : null,
    customerPriceInr:
      row.purchasable && row.purchasePrice != null
        ? usdToInrPaise(row.purchasePrice * years) / 100
        : null,
  }))
}

export async function quoteTldPricing(tld: string) {
  if (!isNamecomConfigured()) {
    throw new Error('Domain registration is not configured on this environment.')
  }
  const pricing = await getPricingForTld(tld)
  if (!pricing) return null
  return {
    ...pricing,
    customerRegistrationInrPaise:
      pricing.registrationPrice != null ? usdToInrPaise(pricing.registrationPrice) : null,
    customerRenewalInrPaise:
      pricing.renewalPrice != null ? usdToInrPaise(pricing.renewalPrice) : null,
  }
}

export async function listProjectDomainRegistrations({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<DomainRegistrationRow[]> {
  await ensureDomainTables()
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)

  const rows = await executeQuery<DomainRegistrationRow>({
    query: `
      select
        id::text as id,
        organization_id,
        project_ref,
        domain_name,
        tld,
        status,
        years,
        provider,
        provider_purchase_price_usd::float8 as provider_purchase_price_usd,
        customer_price_inr_paise,
        razorpay_order_id,
        razorpay_payment_id,
        provider_order_id,
        nameservers,
        metadata,
        registered_by_gotrue_id::text as registered_by_gotrue_id,
        inserted_at::text as inserted_at,
        updated_at::text as updated_at,
        completed_at::text as completed_at,
        last_error
      from saas.domain_registrations
      where project_ref = $1
      order by inserted_at desc
      limit 100
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data ?? []
}

export async function registerDomainAfterPayment({
  claims,
  registrationId,
}: {
  claims: Claims
  registrationId: string
}): Promise<DomainRegistrationRow> {
  await ensureDomainTables()
  const { id: gotrueId } = getActor(claims)

  const existing = await executeQuery<DomainRegistrationRow>({
    query: `
      select
        dr.id::text as id,
        dr.organization_id,
        dr.project_ref,
        dr.domain_name,
        dr.tld,
        dr.status,
        dr.years,
        dr.provider,
        dr.provider_purchase_price_usd::float8 as provider_purchase_price_usd,
        dr.customer_price_inr_paise,
        dr.razorpay_order_id,
        dr.razorpay_payment_id,
        dr.provider_order_id,
        dr.nameservers,
        dr.metadata,
        dr.registered_by_gotrue_id::text as registered_by_gotrue_id,
        dr.inserted_at::text as inserted_at,
        dr.updated_at::text as updated_at,
        dr.completed_at::text as completed_at,
        dr.last_error
      from saas.domain_registrations dr
      join saas.organization_members m
        on m.organization_id = dr.organization_id and m.gotrue_id = $2
      where dr.id = $1::uuid
      limit 1
    `,
    parameters: [registrationId, gotrueId],
    actorId: gotrueId,
  })
  if (existing.error) throw existing.error
  const row = existing.data?.[0]
  if (!row) throw new Error('Domain registration not found')
  if (row.status === 'registered') return row
  if (row.status !== 'paid') {
    throw new Error(`Registration is not ready (status: ${row.status})`)
  }

  const availability = await checkAvailability([row.domain_name])
  const match = availability[0]
  if (!match?.purchasable) {
    throw new Error('Domain is no longer available for registration')
  }

  await executeQuery({
    query: `
      update saas.domain_registrations
      set status = 'registering', updated_at = now(), last_error = null
      where id = $1::uuid
    `,
    parameters: [registrationId],
    actorId: gotrueId,
  })

  try {
    const created = await registerDomain({
      domainName: row.domain_name,
      years: row.years,
      purchasePrice: match.premium ? (match.purchasePrice ?? undefined) : undefined,
    })

    const nameservers = resolveIndobaseDomainNameservers()
    const appliedNs = await setNameservers(row.domain_name, nameservers)

    const updated = await executeQuery<DomainRegistrationRow>({
      query: `
        update saas.domain_registrations
        set
          status = 'registered',
          provider_order_id = coalesce($2, provider_order_id),
          nameservers = $3::jsonb,
          metadata = metadata || $4::jsonb,
          completed_at = now(),
          updated_at = now(),
          last_error = null
        where id = $1::uuid
        returning
          id::text as id,
          organization_id,
          project_ref,
          domain_name,
          tld,
          status,
          years,
          provider,
          provider_purchase_price_usd::float8 as provider_purchase_price_usd,
          customer_price_inr_paise,
          razorpay_order_id,
          razorpay_payment_id,
          provider_order_id,
          nameservers,
          metadata,
          registered_by_gotrue_id::text as registered_by_gotrue_id,
          inserted_at::text as inserted_at,
          updated_at::text as updated_at,
          completed_at::text as completed_at,
          last_error
      `,
      parameters: [
        registrationId,
        created.orderId != null ? String(created.orderId) : null,
        JSON.stringify(appliedNs),
        JSON.stringify({
          expireDate: created.expireDate ?? null,
          premium: match.premium,
          purchaseType: match.purchaseType,
        }),
      ],
      actorId: gotrueId,
    })
    if (updated.error || !updated.data?.[0]) {
      throw updated.error ?? new Error('Failed to update registration row')
    }

    if (row.project_ref) {
      await recordAuditLog({
        claims,
        projectRef: row.project_ref,
        action: 'project.domain.registered',
        targetType: 'domain_registration',
        targetDescription: row.domain_name,
        metadata: { domain: row.domain_name, nameservers: appliedNs },
      })
    }

    return updated.data[0]
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Domain registration failed'
    await executeQuery({
      query: `
        update saas.domain_registrations
        set status = 'failed', last_error = $2, updated_at = now()
        where id = $1::uuid
      `,
      parameters: [registrationId, message],
      actorId: gotrueId,
    })
    throw error
  }
}

export function normalizeDomainQuery(input: string): string | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed.includes('.')) return trimmed
  return `${trimmed}.com`
}

export function extractTld(domainName: string): string {
  const parts = parseDomainParts(domainName)
  return parts?.tld ?? 'com'
}
