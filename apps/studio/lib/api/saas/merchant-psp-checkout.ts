/**
 * Naive merchant checkout — call Razorpay / Stripe APIs with Studio-stored BYOK keys.
 * No Indobase Payments engine / connectors.
 */

import { getStudioOrigin } from './payments-access'

export type PspCheckoutInput = {
  projectRef: string
  planName: string
  /** Major units as decimal string, e.g. "999" or "19.99" */
  price: string
  currency: string
  oneTime: boolean
  billingPeriod: 'MONTHLY' | 'ANNUAL'
  customerEmail: string
  customerName: string
  /** Optional reuse: Razorpay plan_id or Stripe price_id */
  providerPlanOrPriceId?: string | null
  expiresInHours?: number
  successUrl?: string | null
  cancelUrl?: string | null
}

export type PspCheckoutResult = {
  checkout_url: string
  session_id: string
  plan_id?: string
  plan_version_id?: string
  customer_id?: string
  provider: 'razorpay' | 'stripe'
}

function majorToMinorUnits(price: string, currency: string): number {
  const n = Number(price)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('price must be a non-negative number in major units')
  }
  const zeroDecimal = new Set(['JPY', 'KRW', 'VND'])
  const cur = currency.toUpperCase()
  if (zeroDecimal.has(cur)) return Math.round(n)
  return Math.round(n * 100)
}

function defaultUrls(projectRef: string): { success: string; cancel: string } {
  const origin = getStudioOrigin().replace(/\/+$/, '')
  const base = `${origin}/project/${encodeURIComponent(projectRef)}/payments`
  return {
    success: `${base}?checkout=success`,
    cancel: `${base}?checkout=cancel`,
  }
}

async function razorpayRequest<T>(
  keyId: string,
  keySecret: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'User-Agent': 'IndobaseStudio/MerchantCheckout',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text().catch(() => '')
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const errObj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
    const desc =
      (errObj?.error &&
        typeof errObj.error === 'object' &&
        typeof (errObj.error as { description?: string }).description === 'string' &&
        (errObj.error as { description: string }).description) ||
      text.slice(0, 200) ||
      res.statusText
    throw new Error(`Razorpay ${method} ${path} failed (HTTP ${res.status}): ${desc}`)
  }
  return (json ?? {}) as T
}

async function stripeRequest<T>(
  secretKey: string,
  method: string,
  path: string,
  form: URLSearchParams
): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'IndobaseStudio/MerchantCheckout',
    },
    body: method === 'GET' ? undefined : form.toString(),
  })
  const text = await res.text().catch(() => '')
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const errObj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
    const message =
      (errObj?.error &&
        typeof errObj.error === 'object' &&
        typeof (errObj.error as { message?: string }).message === 'string' &&
        (errObj.error as { message: string }).message) ||
      text.slice(0, 200) ||
      res.statusText
    throw new Error(`Stripe ${method} ${path} failed (HTTP ${res.status}): ${message}`)
  }
  return (json ?? {}) as T
}

/**
 * India: Razorpay Payment Link (one-time) or Plan + Subscription (recurring) → short_url.
 */
export async function createRazorpayHostedCheckout(
  keys: { keyId: string; keySecret: string },
  input: PspCheckoutInput
): Promise<PspCheckoutResult> {
  const currency = (input.currency || 'INR').toUpperCase()
  const amount = majorToMinorUnits(input.price, currency)
  const expireBy =
    typeof input.expiresInHours === 'number' && input.expiresInHours > 0
      ? Math.floor(Date.now() / 1000) + Math.round(input.expiresInHours * 3600)
      : undefined

  if (input.oneTime) {
    const link = await razorpayRequest<{
      id?: string
      short_url?: string
      customer?: { id?: string }
    }>(keys.keyId, keys.keySecret, 'POST', '/payment_links', {
      amount,
      currency,
      accept_partial: false,
      description: input.planName,
      customer: {
        name: input.customerName,
        email: input.customerEmail,
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      ...(expireBy ? { expire_by: expireBy } : {}),
      notes: {
        indobase_project: input.projectRef,
        indobase_plan: input.planName,
      },
    })
    const url = typeof link.short_url === 'string' ? link.short_url.trim() : ''
    if (!url.startsWith('http')) {
      throw new Error('Razorpay payment link missing short_url')
    }
    return {
      checkout_url: url,
      session_id: typeof link.id === 'string' ? link.id : '',
      customer_id: link.customer?.id,
      provider: 'razorpay',
    }
  }

  let planId = (input.providerPlanOrPriceId || '').trim()
  if (!planId) {
    const period = input.billingPeriod === 'ANNUAL' ? 'yearly' : 'monthly'
    const plan = await razorpayRequest<{ id?: string }>(
      keys.keyId,
      keys.keySecret,
      'POST',
      '/plans',
      {
        period,
        interval: 1,
        item: {
          name: input.planName,
          amount,
          currency,
          description: input.planName,
        },
        notes: {
          indobase_project: input.projectRef,
        },
      }
    )
    planId = typeof plan.id === 'string' ? plan.id : ''
    if (!planId) throw new Error('Razorpay plan create missing id')
  }

  const sub = await razorpayRequest<{
    id?: string
    short_url?: string
    customer_id?: string
  }>(keys.keyId, keys.keySecret, 'POST', '/subscriptions', {
    plan_id: planId,
    total_count: input.billingPeriod === 'ANNUAL' ? 10 : 120,
    customer_notify: 0,
    notes: {
      indobase_project: input.projectRef,
      indobase_plan: input.planName,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
    },
  })

  const url = typeof sub.short_url === 'string' ? sub.short_url.trim() : ''
  if (!url.startsWith('http')) {
    throw new Error('Razorpay subscription missing short_url')
  }
  return {
    checkout_url: url,
    session_id: typeof sub.id === 'string' ? sub.id : '',
    plan_id: planId,
    plan_version_id: planId,
    customer_id: typeof sub.customer_id === 'string' ? sub.customer_id : undefined,
    provider: 'razorpay',
  }
}

/**
 * International: Stripe Checkout Session (payment or subscription) → url.
 */
export async function createStripeHostedCheckout(
  keys: { secretKey: string },
  input: PspCheckoutInput
): Promise<PspCheckoutResult> {
  const currency = (input.currency || 'USD').toLowerCase()
  const amount = majorToMinorUnits(input.price, currency.toUpperCase())
  const urls = defaultUrls(input.projectRef)
  const success = (input.successUrl || '').trim() || urls.success
  const cancel = (input.cancelUrl || '').trim() || urls.cancel

  let priceId = (input.providerPlanOrPriceId || '').trim()
  if (!priceId) {
    const product = await stripeRequest<{ id?: string }>(
      keys.secretKey,
      'POST',
      '/products',
      new URLSearchParams({
        name: input.planName,
        'metadata[indobase_project]': input.projectRef,
      })
    )
    const productId = typeof product.id === 'string' ? product.id : ''
    if (!productId) throw new Error('Stripe product create missing id')

    const priceParams = new URLSearchParams({
      product: productId,
      currency,
      unit_amount: String(amount),
      'metadata[indobase_project]': input.projectRef,
    })
    if (!input.oneTime) {
      priceParams.set('recurring[interval]', input.billingPeriod === 'ANNUAL' ? 'year' : 'month')
    }
    const price = await stripeRequest<{ id?: string }>(
      keys.secretKey,
      'POST',
      '/prices',
      priceParams
    )
    priceId = typeof price.id === 'string' ? price.id : ''
    if (!priceId) throw new Error('Stripe price create missing id')
  }

  const sessionParams = new URLSearchParams({
    mode: input.oneTime ? 'payment' : 'subscription',
    success_url: success,
    cancel_url: cancel,
    customer_email: input.customerEmail,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'metadata[indobase_project]': input.projectRef,
    'metadata[indobase_plan]': input.planName,
  })
  if (
    typeof input.expiresInHours === 'number' &&
    input.expiresInHours > 0 &&
    input.oneTime
  ) {
    const expiresAt = Math.floor(Date.now() / 1000) + Math.round(input.expiresInHours * 3600)
    // Stripe Checkout expires_at must be 30m–24h from creation for payment mode.
    const min = Math.floor(Date.now() / 1000) + 30 * 60
    const max = Math.floor(Date.now() / 1000) + 24 * 3600
    sessionParams.set('expires_at', String(Math.min(max, Math.max(min, expiresAt))))
  }

  const session = await stripeRequest<{ id?: string; url?: string; customer?: string }>(
    keys.secretKey,
    'POST',
    '/checkout/sessions',
    sessionParams
  )
  const url = typeof session.url === 'string' ? session.url.trim() : ''
  if (!url.startsWith('http')) {
    throw new Error('Stripe Checkout Session missing url')
  }
  return {
    checkout_url: url,
    session_id: typeof session.id === 'string' ? session.id : '',
    plan_id: priceId,
    plan_version_id: priceId,
    customer_id: typeof session.customer === 'string' ? session.customer : undefined,
    provider: 'stripe',
  }
}
