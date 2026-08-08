import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  connectMerchantGatewayKeys,
  getMerchantProfile,
  patchMerchantProfile,
  reviewMerchantProfile,
  submitMerchantProfile,
} from 'lib/api/saas/merchant-kyc'
import type { GatewayConnectBody } from 'lib/api/saas/merchant-gateway-keys'
import type { MerchantProfilePatch } from 'lib/api/saas/merchant-kyc-types'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  if (!claims) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  try {
    if (req.method === 'GET') {
      const profile = await getMerchantProfile({ claims, ref })
      return res.status(200).json({ merchant: profile })
    }

    if (req.method === 'PATCH') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
      const patch = (body?.merchant ?? body) as MerchantProfilePatch
      const profile = await patchMerchantProfile({ claims, ref, patch })
      return res.status(200).json({ merchant: profile })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
      const action = typeof body?.action === 'string' ? body.action.trim() : 'submit'
      if (action === 'submit') {
        const profile = await submitMerchantProfile({ claims, ref })
        return res.status(200).json({ merchant: profile })
      }
      if (action === 'connect_gateway') {
        const profile = await connectMerchantGatewayKeys({
          claims,
          ref,
          body: body as GatewayConnectBody,
        })
        return res.status(200).json({ merchant: profile })
      }
      if (action === 'verify' || action === 'reject') {
        const profile = await reviewMerchantProfile({
          claims,
          ref,
          decision: action,
          reason: typeof body?.reason === 'string' ? body.reason : null,
        })
        return res.status(200).json({ merchant: profile })
      }
      return res.status(400).json({
        message:
          'Unsupported action. Use action: "submit" | "connect_gateway" | "verify" | "reject".',
      })
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Merchant KYC request failed'
    const lower = message.toLowerCase()
    const status =
      lower.includes('not found') || lower.includes('insufficient')
        ? 404
        : lower.includes('owners and admins') ||
            lower.includes('ask an organization') ||
            lower.includes('unauthorized')
          ? 403
          : lower.includes('cannot') ||
              lower.includes('missing') ||
              lower.includes('invalid') ||
              lower.includes('must be') ||
              lower.includes('already') ||
              lower.includes('only enabled')
            ? 400
            : 500
    const body: { message: string; code?: string } = { message }
    if (status === 403 && lower.includes('ask an organization')) {
      body.code = 'payments_role_denied'
    }
    return res.status(status).json(body)
  }
}
