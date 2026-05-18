import type { JwtPayload } from 'indobase-js'

import type { PlanId } from 'data/subscriptions/types'

import { getPrimaryEmail, getGotrueUserId } from './platform'
import { executeQuery } from './query'
import {
  cancelRazorpaySubscription,
  createRazorpaySubscriptionCheckout,
  downgradeOrganizationToFree,
  ensureRazorpayCustomer,
  isRazorpayConfigured,
  tierToPlanId,
  type RazorpayCheckoutResponse,
} from './razorpay-billing'

type Claims = JwtPayload & Record<string, unknown>

async function getOrgBillingRow(claims: Claims, slug: string) {
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    id: number
    slug: string
    name: string
    plan: string
    billing_email: string | null
    razorpay_customer_id: string | null
    subscription_id: string | null
    billing_partner: string | null
  }>({
    query: `
      select o.id, o.slug, o.name, o.plan, o.billing_email, o.razorpay_customer_id,
        o.subscription_id, o.billing_partner
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data?.[0] ?? null
}

export async function updateOrganizationSubscription({
  claims,
  slug,
  tier,
}: {
  claims: Claims
  slug: string
  tier: string
}): Promise<
  | { ok: true; pending_checkout_url?: string; provider?: 'razorpay' }
  | RazorpayCheckoutResponse
> {
  if (!isRazorpayConfigured()) {
    throw new Error('Razorpay billing is not configured on this Studio instance.')
  }

  const org = await getOrgBillingRow(claims, slug)
  if (!org) throw new Error('Organization not found')
  if (org.billing_partner) {
    throw new Error('Subscription is managed by a billing partner and cannot be changed here.')
  }

  const targetPlan = tierToPlanId(tier)

  if (targetPlan === 'free') {
    await downgradeOrganizationToFree(slug)
    return { ok: true }
  }

  if (targetPlan === 'enterprise' || targetPlan === 'platform') {
    throw new Error('Contact sales to change to this plan.')
  }

  if (org.subscription_id?.trim()) {
    try {
      await cancelRazorpaySubscription(org.subscription_id)
    } catch {
      // prior subscription may already be terminal
    }
  }

  const email = org.billing_email ?? getPrimaryEmail(claims)
  const customerId = await ensureRazorpayCustomer({
    organizationId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    email,
    existingCustomerId: org.razorpay_customer_id,
  })

  const checkout = await createRazorpaySubscriptionCheckout({
    organizationId: org.id,
    orgSlug: org.slug,
    planId: targetPlan as PlanId,
    customerId,
  })

  return {
    provider: 'razorpay',
    pending_checkout_url: checkout.checkoutUrl,
    razorpay_subscription_id: checkout.subscriptionId,
  }
}
