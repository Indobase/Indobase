/**
 * OS wire-checkout: create plan + customer + hosted checkout session
 * so agents get a real checkout_url for site CTAs (no invented URLs).
 */

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { assertMerchantCanGoLive } from './merchant-kyc'
import { createPaymentsApiClient, mintPaymentsMcpBearer } from './payments-mcp'

type Claims = JwtPayload & Record<string, unknown>

export type WireCheckoutBody = {
  /** Reuse an existing plan version */
  plan_version_id?: string | null
  /** Create a simple monthly rate plan when plan_version_id omitted */
  plan_name?: string | null
  /** Major units as decimal string, e.g. "999" or "19.99" */
  price?: string | null
  currency?: string | null
  billing_period?: 'MONTHLY' | 'ANNUAL' | string | null
  /**
   * subscription (default RATE monthly/annual) or one_time (Buy CTA / SKU).
   * Aliases: buy | once → one_time; sub → subscription.
   */
  mode?: 'subscription' | 'one_time' | string | null
  /** Reuse customer */
  customer_id?: string | null
  customer_name?: string | null
  customer_email?: string | null
  expires_in_hours?: number | null
}

export type WireCheckoutResult = {
  ok: boolean
  checkout_url?: string
  session_id?: string
  plan_version_id?: string
  plan_id?: string
  customer_id?: string
  message: string
  code?: string
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function pickId(obj: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!obj) return null
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

async function resolveProductFamilyId(
  client: ReturnType<typeof createPaymentsApiClient>
): Promise<string> {
  const listed = await client.request<{ data?: Array<{ id?: string }> }>(
    'GET',
    '/api/v1/product_families',
    { query: { per_page: 10 } }
  )
  const existing = listed.data?.find((f) => typeof f.id === 'string' && f.id.trim())
  if (existing?.id) return existing.id

  const created = await client.request<{ id?: string }>('POST', '/api/v1/product_families', {
    body: { name: 'Default' },
  })
  if (typeof created.id === 'string' && created.id.trim()) return created.id
  throw new Error('Could not create product family for checkout plan')
}

/**
 * Ensure gateway ready, then mint a hosted checkout URL for the operator's site CTA.
 */
export async function wirePaymentsCheckout({
  claims,
  ref,
  body,
}: {
  claims: Claims
  ref: string
  body: WireCheckoutBody
}): Promise<WireCheckoutResult> {
  try {
    await assertMerchantCanGoLive({ claims, ref })
  } catch (err) {
    return {
      ok: false,
      code: 'gateway_not_ready',
      message:
        err instanceof Error
          ? err.message
          : 'Payment gateway not ready — connect Razorpay/Stripe keys first (connectGateway)',
    }
  }

  const minted = await mintPaymentsMcpBearer({ claims, projectRef: ref })
  const client = createPaymentsApiClient({
    apiBaseUrl: minted.apiBaseUrl,
    bearerToken: minted.bearerToken,
  })

  let planVersionId = (body.plan_version_id || '').trim()
  let planId: string | undefined

  if (!planVersionId) {
    const planName = (body.plan_name || 'Starter').trim() || 'Starter'
    const price = (body.price || '').trim()
    if (!price || Number.isNaN(Number(price)) || Number(price) < 0) {
      return {
        ok: false,
        code: 'price_required',
        message:
          'Provide plan_version_id or plan_name + price (e.g. "999") to create a checkout plan',
      }
    }
    const currency = (body.currency || 'INR').trim().toUpperCase() || 'INR'
    const modeRaw = (body.mode || 'subscription').trim().toLowerCase()
    const oneTime =
      modeRaw === 'one_time' ||
      modeRaw === 'onetime' ||
      modeRaw === 'once' ||
      modeRaw === 'buy' ||
      modeRaw === 'purchase'
    const term = ((body.billing_period || 'MONTHLY').trim().toUpperCase() || 'MONTHLY') as string
    const familyId = await resolveProductFamilyId(client)
    const fee = oneTime
      ? { type: 'ONE_TIME', unit_price: price, quantity: 1 }
      : { type: 'RATE', rates: [{ term, price }] }
    const plan = await client.request<Record<string, unknown>>('POST', '/api/v1/plans', {
      body: {
        name: planName,
        product_family_id: familyId,
        plan_type: 'STANDARD',
        status: 'ACTIVE',
        currency,
        components: [
          {
            name: oneTime ? 'Purchase' : term === 'ANNUAL' ? 'Annual' : 'Monthly',
            fee,
          },
        ],
      },
    })
    planVersionId = pickId(plan, 'version_id') || ''
    planId = pickId(plan, 'id') || undefined
    if (!planVersionId) {
      return {
        ok: false,
        code: 'plan_create_failed',
        message: 'Plan created but version_id missing — check Payments plan response',
      }
    }
  }

  let customerId = (body.customer_id || '').trim()
  if (!customerId) {
    const email = (body.customer_email || '').trim()
    const name = (body.customer_name || email || 'Checkout customer').trim()
    if (!email || !email.includes('@')) {
      return {
        ok: false,
        code: 'customer_email_required',
        message:
          'Provide customer_id or customer_email (+ optional customer_name) for the checkout customer',
      }
    }
    const currency = (body.currency || 'INR').trim().toUpperCase() || 'INR'
    const customer = await client.request<Record<string, unknown>>('POST', '/api/v1/customers', {
      body: {
        name,
        currency,
        invoicing_emails: [email],
        custom_taxes: [],
      },
    })
    customerId = pickId(customer, 'id') || ''
    if (!customerId) {
      return {
        ok: false,
        code: 'customer_create_failed',
        message: 'Customer create failed — missing id',
      }
    }
  }

  const expires =
    typeof body.expires_in_hours === 'number' && body.expires_in_hours >= 0
      ? body.expires_in_hours
      : 24

  const sessionRes = await client.request<Record<string, unknown>>(
    'POST',
    '/api/v1/checkout-sessions',
    {
      body: {
        customer_id: customerId,
        plan_version_id: planVersionId,
        expires_in_hours: expires,
      },
    }
  )

  const session = asRecord(sessionRes.session) || sessionRes
  const checkoutUrl =
    (typeof session.checkout_url === 'string' && session.checkout_url.trim()) ||
    (typeof sessionRes.checkout_url === 'string' && sessionRes.checkout_url.trim()) ||
    ''
  const sessionId = pickId(session, 'id') || undefined

  if (!checkoutUrl.startsWith('http')) {
    return {
      ok: false,
      code: 'checkout_url_missing',
      message: 'Checkout session created but checkout_url missing — check Payments portal URL config',
      plan_version_id: planVersionId,
      plan_id: planId,
      customer_id: customerId,
      session_id: sessionId,
    }
  }

  return {
    ok: true,
    checkout_url: checkoutUrl,
    session_id: sessionId,
    plan_version_id: planVersionId,
    plan_id: planId,
    customer_id: customerId,
    message:
      'Checkout ready — set the site Subscribe / Buy CTA href to checkout_url. Never invent a URL.',
  }
}
