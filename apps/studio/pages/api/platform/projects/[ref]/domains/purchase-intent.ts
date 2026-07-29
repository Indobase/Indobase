import type { NextApiRequest, NextApiResponse } from 'next'
import type { JwtPayload } from '@indobaseinc/indobase-js'

import domainsApiWrapper from 'lib/api/domainsApiWrapper'
import {
  createDomainPurchaseIntent,
  isDomainsCheckoutConfigured,
} from 'lib/api/saas/domains-purchase'
import { normalizeDomainQuery } from 'lib/api/saas/domains-service'
import { isNamecomConfigured } from 'lib/api/saas/namecom-client'

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

  if (!isNamecomConfigured()) {
    return res.status(503).json({
      message: 'Domain registration is not configured on this environment.',
      code: 'domains_not_configured',
    })
  }

  if (!isDomainsCheckoutConfigured()) {
    return res.status(503).json({
      message: 'Domain checkout is not configured (Razorpay keys missing).',
      code: 'domains_checkout_not_configured',
    })
  }

  const body = (req.body ?? {}) as { domain?: unknown; years?: unknown }
  const domain =
    typeof body.domain === 'string' ? normalizeDomainQuery(body.domain) : null
  if (!domain) {
    return res.status(400).json({ message: 'domain is required' })
  }

  const years =
    typeof body.years === 'number' && body.years >= 1 && body.years <= 10 ? body.years : 1

  try {
    const intent = await createDomainPurchaseIntent({ claims, ref, domainName: domain, years })
    return res.status(200).json(intent)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create purchase intent'
    const status = message.toLowerCase().includes('not available') ? 409 : 500
    return res.status(status).json({ message })
  }
}
