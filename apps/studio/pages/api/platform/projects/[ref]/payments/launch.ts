import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import {
  getPaymentsLaunchRedirect,
  isPaymentsRoleDeniedMessage,
  PAYMENTS_ROLE_DENIED_CODE,
  paymentsTenantSlugForOrg,
} from 'lib/api/saas/payments-launch'

const paymentsLaunchHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

export default paymentsLaunchHandler

/**
 * Compatibility endpoint: previously minted SSO to payments.indobase.in.
 * Now returns the Studio project Payments hub (BYOK Razorpay/Stripe).
 */
async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const { ref } = req.query
  if (typeof ref !== 'string' || !ref.trim()) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  if (!claims) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  try {
    const response = await getPaymentsLaunchRedirect({
      claims,
      ref: ref.trim(),
    })

    return res.status(200).json({
      url: response.url,
      project_ref: response.project.ref,
      organization_slug: response.project.organization_slug,
      payments_tenant_slug: response.paymentsTenantSlug,
      role: response.role,
      mode: 'studio_byok',
      message:
        'Merchant payments are configured in Studio (Connect gateway). There is no separate Payments product dashboard.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to open Payments setup'
    if (isPaymentsRoleDeniedMessage(message)) {
      return res.status(403).json({
        code: PAYMENTS_ROLE_DENIED_CODE,
        message:
          'Ask an organization owner or admin to grant you Payments access. Developers and viewers can open Payments once they are members of this organization.',
      })
    }
    const status = message.toLowerCase().includes('not found') ? 404 : 500
    return res.status(status).json({ message })
  }
}

export { paymentsTenantSlugForOrg }
