import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { INDOBASE_PLAN_DISPLAY_NAMES, resolveIndobasePlanPriceInr } from 'lib/api/saas/indobase-billing-plans'
import { getOrganizationBillingView } from 'lib/api/saas/platform'
import { tierToPlanId } from 'lib/api/saas/razorpay-billing'
import type { PlanId } from 'data/subscriptions/types'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const slug =
    typeof req.query.slug === 'string'
      ? req.query.slug
      : Array.isArray(req.query.slug)
        ? req.query.slug[0]
        : ''
  const tier = typeof req.query.tier === 'string' ? req.query.tier : undefined

  if (!slug || !tier) {
    return res.status(400).json({ message: 'slug and tier are required' })
  }

  const view = await getOrganizationBillingView({ claims: claims as JwtPayload, slug })
  if (!view) {
    return res.status(404).json({ message: 'Organization not found' })
  }

  const targetPlan = tierToPlanId(tier) as PlanId
  const amount = resolveIndobasePlanPriceInr(targetPlan)

  return res.status(200).json({
    plan: {
      id: targetPlan,
      name: INDOBASE_PLAN_DISPLAY_NAMES[targetPlan] ?? targetPlan,
    },
    recurring_amount: amount ?? 0,
    currency: 'INR',
    tax_amount: amount != null ? Math.round(amount * 0.18) : 0,
    total_amount: amount != null ? Math.round(amount * 1.18) : 0,
    payment_method_type: 'razorpay',
    billing_via_partner: false,
  })
}
