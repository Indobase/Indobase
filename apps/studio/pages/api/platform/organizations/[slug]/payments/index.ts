import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { getOrganizationBillingView } from 'lib/api/saas/platform'

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
  if (!slug) {
    return res.status(400).json({ message: 'Missing organization slug' })
  }

  const view = await getOrganizationBillingView({ claims: claims as JwtPayload, slug })
  if (!view) {
    return res.status(404).json({ message: 'Organization not found' })
  }

  const hasRazorpay = Boolean(view.razorpay_customer_id || view.subscription_id)

  return res.status(200).json({
    defaultPaymentMethodId: hasRazorpay ? 'razorpay' : null,
    data: hasRazorpay
      ? [
          {
            id: 'razorpay',
            type: 'razorpay',
            is_default: true,
            label: 'Razorpay (UPI, cards, netbanking)',
          },
        ]
      : [],
  })
}
