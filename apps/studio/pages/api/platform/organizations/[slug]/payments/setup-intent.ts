import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { isRazorpayConfigured } from 'lib/api/saas/razorpay-billing'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, _claims?: JwtPayload) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (!isRazorpayConfigured()) {
    return res.status(503).json({
      message: 'Razorpay billing is not configured.',
    })
  }

  return res.status(200).json({
    provider: 'razorpay',
    message: 'Change plan under Subscription to open Razorpay checkout.',
  })
}
