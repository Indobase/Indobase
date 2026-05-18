import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { applyOrganizationPlan, tierToPlanId } from 'lib/api/saas/razorpay-billing'
import { executeQuery } from 'lib/api/saas/query'
import { getGotrueUserId } from 'lib/api/saas/platform'

/**
 * After Razorpay hosted checkout, the client can call this to sync plan if webhooks are delayed.
 */
export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const slug =
    typeof req.query.slug === 'string'
      ? req.query.slug
      : Array.isArray(req.query.slug)
        ? req.query.slug[0]
        : ''
  if (!slug) {
    return res.status(400).json({ message: 'Missing organization slug' })
  }

  const gotrueId = getGotrueUserId(claims as JwtPayload)
  const rows = await executeQuery<{
    billing_pending_tier: string | null
    plan: string
    subscription_id: string | null
  }>({
    query: `
      select o.billing_pending_tier, o.plan, o.subscription_id
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })

  const org = rows.data?.[0]
  if (!org) {
    return res.status(404).json({ message: 'Organization not found' })
  }

  const pending = org.billing_pending_tier
  if (pending) {
    const planId = tierToPlanId(pending)
    await applyOrganizationPlan({
      orgSlug: slug,
      planId,
      razorpaySubscriptionId: org.subscription_id,
    })
  }

  return res.status(200).json({})
}
