import { createHmac, timingSafeEqual } from 'crypto'

import type { PlanId } from 'data/subscriptions/types'

import { captureBillingEvent } from './billing-analytics'
import { INDOBASE_BILLING_CURRENCY, resolveIndobasePlanPriceInr } from './indobase-billing-plans'
import { planRank } from './plan-entitlements'
import { executeQuery } from './query'

/**
 * Current plan for an org, read before a webhook mutates it so billing events can report the real
 * transition (from_plan -> to_plan). Best-effort: returns 'free' if unreadable, since a missing
 * analytics label must never block a billing webhook.
 */
async function readOrganizationPlanForAnalytics(orgSlug: string): Promise<string> {
  try {
    const rows = await executeQuery<{ plan: string }>({
      query: `select plan from saas.organizations where slug = $1 limit 1`,
      parameters: [orgSlug],
    })
    if (rows.error) throw rows.error
    return rows.data?.[0]?.plan ?? 'free'
  } catch {
    return 'free'
  }
}

const RAZORPAY_API = 'https://api.razorpay.com/v1'

const planIdCache = new Map<PlanId, string>()

function authHeader(): string {
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
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const payload = (await response.json()) as T & { error?: { description?: string; code?: string } }
  if (!response.ok) {
    const message =
      (payload as { error?: { description?: string } }).error?.description ||
      `Razorpay API error (${response.status})`
    throw new Error(message)
  }
  return payload
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim())
}

export function tierToPlanId(tier: string): PlanId {
  switch (tier) {
    case 'tier_free':
      return 'free'
    case 'tier_basic':
      return 'basic'
    case 'tier_pro':
    case 'tier_payg':
      return 'pro'
    case 'tier_studio':
      return 'studio'
    case 'tier_team':
      return 'team'
    case 'tier_enterprise':
      return 'enterprise'
    case 'tier_platform':
      return 'platform'
    default:
      return tier as PlanId
  }
}

function planEnvKey(planId: PlanId): string {
  return `RAZORPAY_PLAN_ID_${planId.toUpperCase()}`
}

async function ensureRazorpayPlanId(planId: PlanId): Promise<string> {
  if (planId === 'free' || planId === 'enterprise' || planId === 'platform') {
    throw new Error(`Plan ${planId} does not use Razorpay checkout`)
  }

  // Legacy team checkouts map to Studio Razorpay plan / price.
  const checkoutPlanId: PlanId = planId === 'team' ? 'studio' : planId

  const fromEnv = process.env[planEnvKey(checkoutPlanId)]?.trim()
  if (fromEnv) return fromEnv

  const cached = planIdCache.get(checkoutPlanId)
  if (cached) return cached

  const amountInr = resolveIndobasePlanPriceInr(checkoutPlanId)
  if (amountInr == null || amountInr <= 0) {
    throw new Error(`No INR price configured for plan ${checkoutPlanId}`)
  }

  const created = await razorpayRequest<{ id: string }>('/plans', {
    method: 'POST',
    body: JSON.stringify({
      period: 'monthly',
      interval: 1,
      item: {
        name: `Indobase ${checkoutPlanId}`,
        amount: amountInr * 100,
        currency: INDOBASE_BILLING_CURRENCY,
        description: `Indobase ${checkoutPlanId} monthly subscription`,
      },
      notes: { indobase_plan_id: checkoutPlanId },
    }),
  })

  planIdCache.set(checkoutPlanId, created.id)
  return created.id
}

export async function ensureRazorpayCustomer({
  organizationId,
  orgSlug,
  orgName,
  email,
  existingCustomerId,
}: {
  organizationId: number
  orgSlug: string
  orgName: string
  email: string
  existingCustomerId?: string | null
}): Promise<string> {
  if (existingCustomerId?.trim()) return existingCustomerId.trim()

  const customer = await razorpayRequest<{ id: string }>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: orgName,
      email,
      notes: { org_slug: orgSlug, organization_id: String(organizationId) },
    }),
  })

  await executeQuery({
    query: `
      update saas.organizations
      set razorpay_customer_id = $1, billing_provider = 'razorpay', updated_at = now()
      where id = $2
    `,
    parameters: [customer.id, organizationId],
  })

  return customer.id
}

export async function createRazorpaySubscriptionCheckout({
  organizationId,
  orgSlug,
  planId,
  customerId,
  totalCount = 120,
}: {
  organizationId: number
  orgSlug: string
  planId: PlanId
  customerId: string
  totalCount?: number
}): Promise<{ subscriptionId: string; checkoutUrl: string }> {
  const razorpayPlanId = await ensureRazorpayPlanId(planId)

  const subscription = await razorpayRequest<{ id: string; short_url?: string }>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: razorpayPlanId,
      customer_id: customerId,
      customer_notify: 1,
      total_count: totalCount,
      quantity: 1,
      notes: {
        org_slug: orgSlug,
        organization_id: String(organizationId),
        indobase_plan_id: planId,
      },
    }),
  })

  if (!subscription.short_url) {
    throw new Error('Razorpay did not return a checkout URL for this subscription')
  }

  await executeQuery({
    query: `
      update saas.organizations
      set
        subscription_id = $1,
        billing_pending_tier = $2,
        billing_provider = 'razorpay',
        updated_at = now()
      where id = $3
    `,
    parameters: [subscription.id, planId, organizationId],
  })

  return { subscriptionId: subscription.id, checkoutUrl: subscription.short_url }
}

export async function cancelRazorpaySubscription(subscriptionId: string): Promise<void> {
  await razorpayRequest(`/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancel_at_cycle_end: 0 }),
  })
}

type RazorpaySubscription = {
  id: string
  status: string
  plan_id: string
  notes?: Record<string, string>
  customer_id?: string
}

export async function fetchRazorpaySubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(`/subscriptions/${subscriptionId}`)
}

export function isPaidRazorpaySubscriptionStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return normalized === 'active' || normalized === 'authenticated'
}

const PAID_PLAN_IDS: PlanId[] = ['basic', 'pro', 'studio', 'team']

function isPaidPlanId(planId: PlanId): boolean {
  return PAID_PLAN_IDS.includes(planId)
}

async function getOrganizationBillingContext(orgSlug: string) {
  const rows = await executeQuery<{
    subscription_id: string | null
    billing_pending_tier: string | null
    plan: string
  }>({
    query: `
      select subscription_id, billing_pending_tier, plan
      from saas.organizations
      where slug = $1
      limit 1
    `,
    parameters: [orgSlug],
  })
  if (rows.error) throw rows.error
  return rows.data?.[0] ?? null
}

export async function verifyRazorpaySubscriptionForOrg({
  orgSlug,
  subscriptionId,
  expectedPlanId,
}: {
  orgSlug: string
  subscriptionId: string
  expectedPlanId: PlanId
}): Promise<{ ok: true; subscription: RazorpaySubscription } | { ok: false; reason: string }> {
  if (!isPaidPlanId(expectedPlanId)) {
    return { ok: false, reason: 'Plan does not require Razorpay payment confirmation' }
  }

  const org = await getOrganizationBillingContext(orgSlug)
  if (!org) {
    return { ok: false, reason: 'Organization not found' }
  }

  const storedSubId = org.subscription_id?.trim()
  if (!storedSubId || storedSubId !== subscriptionId.trim()) {
    return { ok: false, reason: 'Subscription does not match organization billing record' }
  }

  const subscription = await fetchRazorpaySubscription(subscriptionId)
  if (!isPaidRazorpaySubscriptionStatus(subscription.status)) {
    return { ok: false, reason: `Subscription is not paid (status: ${subscription.status})` }
  }

  const notes = subscription.notes ?? {}
  if (notes.org_slug && notes.org_slug !== orgSlug) {
    return { ok: false, reason: 'Subscription organization mismatch' }
  }

  const notesPlan = notes.indobase_plan_id as PlanId | undefined
  if (notesPlan && notesPlan !== expectedPlanId) {
    return { ok: false, reason: 'Subscription plan mismatch' }
  }

  const pendingTier = org.billing_pending_tier?.trim()
  if (pendingTier && tierToPlanId(pendingTier) !== expectedPlanId) {
    return { ok: false, reason: 'Pending plan does not match subscription' }
  }

  return { ok: true, subscription }
}

async function recordRazorpayWebhookEvent(eventId: string, eventName: string): Promise<boolean> {
  const result = await executeQuery<{ event_id: string }>({
    query: `
      insert into saas.razorpay_webhook_events (event_id, event_name)
      values ($1, $2)
      on conflict (event_id) do nothing
      returning event_id
    `,
    parameters: [eventId, eventName],
  })
  if (result.error) throw result.error
  return (result.data?.length ?? 0) > 0
}

export async function applyOrganizationPlan({
  orgSlug,
  planId,
  razorpayCustomerId,
  razorpaySubscriptionId,
  clearPending = true,
}: {
  orgSlug: string
  planId: PlanId
  razorpayCustomerId?: string | null
  razorpaySubscriptionId?: string | null
  clearPending?: boolean
}): Promise<void> {
  await executeQuery({
    query: `
      update saas.organizations o
      set
        plan = $1,
        razorpay_customer_id = coalesce($2, o.razorpay_customer_id),
        subscription_id = coalesce($3, o.subscription_id),
        billing_provider = 'razorpay',
        billing_pending_tier = case when $4 then null else o.billing_pending_tier end,
        updated_at = now()
      where o.slug = $5
    `,
    parameters: [
      planId,
      razorpayCustomerId ?? null,
      razorpaySubscriptionId ?? null,
      clearPending,
      orgSlug,
    ],
  })
}

export async function downgradeOrganizationToFree(orgSlug: string): Promise<void> {
  const rows = await executeQuery<{ subscription_id: string | null }>({
    query: `select subscription_id from saas.organizations where slug = $1 limit 1`,
    parameters: [orgSlug],
  })
  const subId = rows.data?.[0]?.subscription_id
  if (subId?.trim()) {
    try {
      await cancelRazorpaySubscription(subId)
    } catch {
      // subscription may already be cancelled
    }
  }

  await executeQuery({
    query: `
      update saas.organizations
      set
        plan = 'free',
        billing_pending_tier = null,
        subscription_id = null,
        usage_billing_enabled = false,
        updated_at = now()
      where slug = $1
    `,
    parameters: [orgSlug],
  })

  try {
    const { syncOrganizationDataPlaneForPlan } = await import('./data-plane-mode-sync')
    await syncOrganizationDataPlaneForPlan({
      orgSlug,
      planId: 'free',
      reason: 'razorpay_downgrade',
    })
  } catch (error) {
    console.warn('[razorpay] data plane sync after downgrade failed:', error)
  }
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim()
  if (!secret || !signature) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export async function handleRazorpayWebhookEvent(
  event: {
    event?: string
    payload?: {
      subscription?: { entity?: Record<string, unknown> }
      payment?: { entity?: Record<string, unknown> }
    }
  },
  options?: { eventId?: string }
): Promise<void> {
  const eventName = event.event ?? ''
  const eventId = options?.eventId?.trim()

  if (eventId) {
    const isNew = await recordRazorpayWebhookEvent(eventId, eventName || 'unknown')
    if (!isNew) return
  }

  const subscription = event.payload?.subscription?.entity as
    | {
        id?: string
        status?: string
        notes?: Record<string, string>
        customer_id?: string
      }
    | undefined

  /*
   * `payment.*` events carry a payment entity, not a subscription one — reading notes only from
   * `subscription` would leave payment.failed without an org slug and bail out below, making its
   * handler unreachable. Fall back to the payment entity's notes.
   */
  const payment = event.payload?.payment?.entity as
    | { notes?: Record<string, string>; error_code?: string }
    | undefined

  const notes = subscription?.notes ?? payment?.notes ?? {}
  const orgSlug = notes.org_slug
  const planId = (notes.indobase_plan_id as PlanId | undefined) ?? undefined

  if (!orgSlug) return

  switch (eventName) {
    case 'subscription.authenticated':
    case 'subscription.activated':
    case 'subscription.charged': {
      if (!planId || !isPaidPlanId(planId)) return
      if (!subscription?.id || !subscription.status) return
      if (!isPaidRazorpaySubscriptionStatus(subscription.status)) return

      const verified = await verifyRazorpaySubscriptionForOrg({
        orgSlug,
        subscriptionId: subscription.id,
        expectedPlanId: planId,
      })
      if (!verified.ok) {
        console.warn('[razorpay/webhook] skipped plan apply:', verified.reason, { orgSlug, planId })
        return
      }

      // Read the current plan BEFORE applying, so the event reports the actual transition.
      const previousPlan = await readOrganizationPlanForAnalytics(orgSlug)

      await applyOrganizationPlan({
        orgSlug,
        planId,
        razorpayCustomerId: subscription?.customer_id,
        razorpaySubscriptionId: subscription?.id,
      })

      if (previousPlan !== planId) {
        void captureBillingEvent({
          orgSlug,
          event:
            planRank(planId) >= planRank(previousPlan) ? 'billing.upgraded' : 'billing.downgraded',
          properties: { from_plan: previousPlan, to_plan: planId },
        })
      }
      try {
        const { syncOrganizationDataPlaneForPlan } = await import('./data-plane-mode-sync')
        await syncOrganizationDataPlaneForPlan({
          orgSlug,
          planId,
          reason: 'razorpay_webhook',
        })
      } catch (error) {
        console.warn('[razorpay/webhook] data plane sync after upgrade failed:', error)
      }
      break
    }
    case 'subscription.cancelled':
    case 'subscription.completed':
    case 'subscription.halted': {
      const cancelledFromPlan = await readOrganizationPlanForAnalytics(orgSlug)

      await downgradeOrganizationToFree(orgSlug)

      void captureBillingEvent({
        orgSlug,
        event: 'billing.subscription_cancelled',
        properties: {
          from_plan: cancelledFromPlan,
          // 'cancelled' | 'completed' | 'halted' — halted usually means repeated payment failure.
          reason: eventName.replace('subscription.', ''),
        },
      })
      break
    }
    case 'payment.failed': {
      void captureBillingEvent({
        orgSlug,
        event: 'billing.payment_failed',
        // Provider error code only — never the raw message, which can echo payer detail.
        properties: { plan: planId, error_code: payment?.error_code },
      })
      break
    }
    default:
      break
  }
}

export type RazorpayCheckoutResponse = {
  provider: 'razorpay'
  pending_checkout_url: string
  razorpay_subscription_id: string
}
