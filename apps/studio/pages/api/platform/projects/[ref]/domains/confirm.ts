import type { NextApiRequest, NextApiResponse } from 'next'
import type { JwtPayload } from '@indobaseinc/indobase-js'

import domainsApiWrapper from 'lib/api/domainsApiWrapper'
import { confirmDomainPurchase } from 'lib/api/saas/domains-purchase'

export default (req: NextApiRequest, res: NextApiResponse) =>
  domainsApiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  const body = (req.body ?? {}) as {
    registration_id?: unknown
    razorpay_order_id?: unknown
    razorpay_payment_id?: unknown
    razorpay_signature?: unknown
  }

  const registrationId =
    typeof body.registration_id === 'string' ? body.registration_id.trim() : ''
  const razorpayOrderId =
    typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id.trim() : ''
  const razorpayPaymentId =
    typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id.trim() : ''
  const razorpaySignature =
    typeof body.razorpay_signature === 'string' ? body.razorpay_signature.trim() : ''

  if (!registrationId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({
      message:
        'registration_id, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required',
    })
  }

  try {
    const registration = await confirmDomainPurchase({
      claims,
      registrationId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    })

    return res.status(200).json({
      registration,
      attach_custom_domain_url: registration.project_ref
        ? `/project/${registration.project_ref}/settings/general#custom-domains`
        : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to confirm domain purchase'
    const status = message.toLowerCase().includes('signature') ? 400 : 500
    return res.status(status).json({ message })
  }
}
