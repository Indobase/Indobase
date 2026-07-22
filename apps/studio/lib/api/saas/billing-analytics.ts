import { capturePostHogEvent } from 'lib/posthog-server'
import { executeQuery } from './query'

/**
 * Server-side billing analytics.
 *
 * Billing state changes arrive on Razorpay webhooks, where there is no browser and no session — so
 * these capture straight to PostHog server-side rather than going through the client telemetry
 * route. Webhooks are organization-scoped, so we attribute to the org owner and attach the org as
 * a PostHog group; revenue reporting is almost always per-organization, not per-seat.
 *
 * Every function here is best-effort: analytics must never break or delay a billing webhook, so
 * failures are logged and swallowed.
 */

type BillingEventName =
  | 'billing.upgraded'
  | 'billing.downgraded'
  | 'billing.subscription_cancelled'
  | 'billing.payment_failed'
  | 'billing.trial_started'
  | 'billing.trial_expired'
  | 'billing.coupon_used'

/** Owner of an org, used as the PostHog distinct_id for org-level billing events. */
async function resolveOrgOwner(
  orgSlug: string
): Promise<{ gotrueId: string; plan: string } | null> {
  try {
    const rows = await executeQuery<{ gotrue_id: string; plan: string }>({
      query: `
        select
          (
            select m.gotrue_id::text
            from saas.organization_members m
            where m.organization_id = o.id and m.role = 'owner'
            order by m.inserted_at asc nulls last, m.gotrue_id asc
            limit 1
          ) as gotrue_id,
          o.plan
        from saas.organizations o
        where o.slug = $1
        limit 1
      `,
      parameters: [orgSlug],
    })
    if (rows.error) throw rows.error

    const row = rows.data?.[0]
    if (!row?.gotrue_id) return null

    return { gotrueId: row.gotrue_id, plan: row.plan }
  } catch (error) {
    console.warn('[billing-analytics] could not resolve org owner for %s: %O', orgSlug, error)
    return null
  }
}

/**
 * Record a billing event for an organization. Resolves the owner for attribution and groups the
 * event by organization so revenue funnels work at the account level.
 */
export async function captureBillingEvent({
  orgSlug,
  event,
  properties = {},
}: {
  orgSlug: string
  event: BillingEventName
  properties?: Record<string, unknown>
}): Promise<void> {
  try {
    const owner = await resolveOrgOwner(orgSlug)
    if (!owner) return

    await capturePostHogEvent(owner.gotrueId, event, {
      ...properties,
      organization_slug: orgSlug,
      $groups: { organization: orgSlug },
    })
  } catch (error) {
    // Never let analytics failure affect billing.
    console.warn('[billing-analytics] capture failed for %s (%s): %O', orgSlug, event, error)
  }
}
