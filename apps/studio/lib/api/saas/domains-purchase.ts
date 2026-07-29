import { createHmac, timingSafeEqual } from 'crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import {
  ensureDomainTables,
  extractTld,
  registerDomainAfterPayment,
  searchDomainsForProject,
  type DomainRegistrationRow,
} from './domains-service'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, unknown>

const RAZORPAY_API = 'https://api.razorpay.com/v1'

function razorpayAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim()
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim()
  if (!keyId || !secret) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.')
  }
  return `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`
}

async function razorpayRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    ...init,
    headers: {
      Authorization: razorpayAuthHeader(),
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const payload = (await response.json()) as T & { error?: { description?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.description || `Razorpay API error (${response.status})`)
  }
  return payload
}

export function isDomainsCheckoutConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim())
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

export type DomainPurchaseIntent = {
  registration: DomainRegistrationRow
  razorpay: {
    key_id: string
    order_id: string
    amount: number
    currency: 'INR'
  }
}

export async function createDomainPurchaseIntent({
  claims,
  ref,
  domainName,
  years = 1,
}: {
  claims: Claims
  ref: string
  domainName: string
  years?: number
}): Promise<DomainPurchaseIntent> {
  if (!isDomainsCheckoutConfigured()) {
    throw new Error('Domain checkout is not configured (Razorpay keys missing).')
  }

  await ensureDomainTables()
  const { id: gotrueId } = getActor(claims)

  const quotes = await searchDomainsForProject({
    claims,
    ref,
    queries: [domainName],
    years,
  })
  const quote = quotes[0]
  if (!quote?.purchasable || quote.customerPriceInrPaise == null) {
    throw new Error('Domain is not available for purchase')
  }

  const project = await executeQuery<{ organization_id: number }>({
    query: `
      select organization_id
      from saas.projects
      where ref = $1
      limit 1
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (project.error || !project.data?.[0]) {
    throw project.error ?? new Error('Project not found')
  }

  const normalizedDomain = quote.domainName
  const tld = extractTld(normalizedDomain)

  const inserted = await executeQuery<DomainRegistrationRow>({
    query: `
      insert into saas.domain_registrations (
        organization_id,
        project_ref,
        domain_name,
        tld,
        status,
        years,
        provider_purchase_price_usd,
        customer_price_inr_paise,
        metadata,
        registered_by_gotrue_id
      ) values (
        $1, $2, $3, $4, 'quoted', $5, $6, $7, $8::jsonb, $9::uuid
      )
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
      project.data[0].organization_id,
      ref,
      normalizedDomain,
      tld,
      years,
      quote.purchasePrice,
      quote.customerPriceInrPaise,
      JSON.stringify({ premium: quote.premium, purchaseType: quote.purchaseType }),
      gotrueId,
    ],
    actorId: gotrueId,
  })
  if (inserted.error || !inserted.data?.[0]) {
    throw inserted.error ?? new Error('Failed to create domain registration record')
  }

  const registration = inserted.data[0]

  const order = await razorpayRequest<{ id: string }>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount: registration.customer_price_inr_paise,
      currency: 'INR',
      receipt: `domain-${registration.id.slice(0, 8)}`,
      notes: {
        kind: 'domain_registration',
        domain: normalizedDomain,
        project_ref: ref,
        registration_id: registration.id,
      },
    }),
  })

  const updated = await executeQuery<DomainRegistrationRow>({
    query: `
      update saas.domain_registrations
      set status = 'payment_pending', razorpay_order_id = $2, updated_at = now()
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
    parameters: [registration.id, order.id],
    actorId: gotrueId,
  })
  if (updated.error || !updated.data?.[0]) {
    throw updated.error ?? new Error('Failed to attach Razorpay order')
  }

  const keyId = process.env.RAZORPAY_KEY_ID!.trim()
  return {
    registration: updated.data[0],
    razorpay: {
      key_id: keyId,
      order_id: order.id,
      amount: registration.customer_price_inr_paise,
      currency: 'INR',
    },
  }
}

export function verifyRazorpayPaymentSignature(input: {
  orderId: string
  paymentId: string
  signature: string
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim()
  if (!secret) return false
  const body = `${input.orderId}|${input.paymentId}`
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature))
  } catch {
    return false
  }
}

export async function confirmDomainPurchase({
  claims,
  registrationId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}: {
  claims: Claims
  registrationId: string
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}): Promise<DomainRegistrationRow> {
  if (
    !verifyRazorpayPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    })
  ) {
    throw new Error('Invalid Razorpay payment signature')
  }

  await ensureDomainTables()
  const { id: gotrueId } = getActor(claims)

  const paid = await executeQuery<DomainRegistrationRow>({
    query: `
      update saas.domain_registrations dr
      set
        status = 'paid',
        razorpay_payment_id = $3,
        updated_at = now(),
        last_error = null
      from saas.organization_members m
      where dr.id = $1::uuid
        and m.organization_id = dr.organization_id
        and m.gotrue_id = $2
        and dr.razorpay_order_id = $4
        and dr.status in ('quoted', 'payment_pending')
      returning
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
    `,
    parameters: [registrationId, gotrueId, razorpayPaymentId, razorpayOrderId],
    actorId: gotrueId,
  })
  if (paid.error) throw paid.error
  if (!paid.data?.[0]) {
    throw new Error('Payment could not be matched to a pending domain registration')
  }

  return registerDomainAfterPayment({ claims, registrationId })
}
