import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { getOrganizationBillingView } from 'lib/api/saas/platform'
import { updateOrganizationSubscription } from 'lib/api/saas/org-billing'
import { isRazorpayConfigured } from 'lib/api/saas/razorpay-billing'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type ResponseData =
  paths['/platform/organizations/{slug}/billing/subscription']['get']['responses']['200']['content']['application/json']

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res, claims)
    case 'PUT':
      return handlePut(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'PUT'])
      return res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
  claims: JwtPayload | undefined
) => {
  const slug =
    typeof req.query.slug === 'string' ? req.query.slug : Array.isArray(req.query.slug) ? req.query.slug[0] : ''
  if (!slug) {
    return res.status(400).json({ data: null, error: { message: 'Missing organization slug' } } as any)
  }

  const view = await getOrganizationBillingView({ claims: claims as any, slug })
  if (!view) {
    return res.status(404).json({ data: null, error: { message: 'Organization not found' } } as any)
  }

  const partner = (view.billing_partner ?? '').toLowerCase()
  const response: ResponseData = {
    billing_cycle_anchor: 0,
    current_period_end: 0,
    current_period_start: 0,
    next_invoice_at: 0,
    usage_billing_enabled: view.usage_billing_enabled,
    plan: view.plan as ResponseData['plan'],
    addons: [],
    project_addons: [],
    payment_method_type:
      view.subscription_id && (view.billing_provider === 'razorpay' || isRazorpayConfigured())
        ? 'razorpay'
        : view.stripe_customer_id
          ? 'card'
          : '',
    billing_via_partner: Boolean(view.billing_partner),
    billing_partner: (partner === 'fly' || partner === 'aws_marketplace' || partner === 'vercel_marketplace'
      ? partner
      : 'fly') as ResponseData['billing_partner'],
    scheduled_plan_change: null,
    customer_balance: 0,
  }

  return res.status(200).json(response)
}

const handlePut = async (
  req: NextApiRequest,
  res: NextApiResponse,
  claims: JwtPayload | undefined
) => {
  const slug =
    typeof req.query.slug === 'string'
      ? req.query.slug
      : Array.isArray(req.query.slug)
        ? req.query.slug[0]
        : ''
  if (!slug) {
    return res.status(400).json({ message: 'Missing organization slug' } as any)
  }

  const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const tier = raw?.tier as string | undefined
  if (!tier) {
    return res.status(400).json({ message: 'tier is required' } as any)
  }

  if (!isRazorpayConfigured()) {
    return res.status(503).json({
      message: 'Razorpay billing is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
    } as any)
  }

  try {
    const result = await updateOrganizationSubscription({
      claims: claims as JwtPayload,
      slug,
      tier,
    })

    if ('pending_checkout_url' in result && result.pending_checkout_url) {
      return res.status(200).json({
        pending_checkout_url: result.pending_checkout_url,
        provider: 'razorpay',
        pending_payment_intent_secret: null,
      } as any)
    }

    return res.status(200).json({} as any)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update subscription'
    return res.status(400).json({ message } as any)
  }
}
