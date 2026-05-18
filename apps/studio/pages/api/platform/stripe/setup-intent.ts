import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { isRazorpayConfigured } from 'lib/api/saas/razorpay-billing'

/**
 * Legacy Stripe setup-intent path. For Indobase SaaS + Razorpay, paid org creation uses
 * Razorpay subscription checkout after POST /platform/organizations (no card form here).
 */
export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (isRazorpayConfigured()) {
    return res.status(200).json({
      provider: 'razorpay',
      client_secret: null,
      message: 'Use Razorpay checkout after creating the organization.',
    })
  }

  return res.status(503).json({
    message:
      'Card setup via Stripe is not enabled. Configure Razorpay (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) or Stripe.',
  })
}
