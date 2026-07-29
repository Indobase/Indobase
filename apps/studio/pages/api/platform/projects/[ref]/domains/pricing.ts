import type { NextApiRequest, NextApiResponse } from 'next'
import type { JwtPayload } from '@indobaseinc/indobase-js'

import domainsApiWrapper from 'lib/api/domainsApiWrapper'
import { quoteTldPricing } from 'lib/api/saas/domains-service'
import { isNamecomConfigured } from 'lib/api/saas/namecom-client'

export default (req: NextApiRequest, res: NextApiResponse) =>
  domainsApiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  if (!isNamecomConfigured()) {
    return res.status(503).json({
      message: 'Domain pricing is not configured on this environment.',
      code: 'domains_not_configured',
    })
  }

  const tld =
    typeof req.query.tld === 'string'
      ? req.query.tld.replace(/^\./, '').trim().toLowerCase()
      : 'com'

  try {
    const pricing = await quoteTldPricing(tld)
    if (!pricing) {
      return res.status(404).json({ message: `TLD .${tld} is not available` })
    }
    return res.status(200).json({ tld, pricing })
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to load TLD pricing',
    })
  }
}
