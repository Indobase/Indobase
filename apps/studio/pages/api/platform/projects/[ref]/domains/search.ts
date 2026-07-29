import type { NextApiRequest, NextApiResponse } from 'next'
import type { JwtPayload } from '@indobaseinc/indobase-js'

import domainsApiWrapper from 'lib/api/domainsApiWrapper'
import {
  normalizeDomainQuery,
  searchDomainsForProject,
} from 'lib/api/saas/domains-service'
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
      message: 'Domain search is not configured on this environment.',
      code: 'domains_not_configured',
    })
  }

  const body = (req.body ?? {}) as { query?: unknown; queries?: unknown; years?: unknown }
  const rawQueries = Array.isArray(body.queries)
    ? body.queries
    : body.query != null
      ? [body.query]
      : []
  const queries = rawQueries
    .map((entry) => (typeof entry === 'string' ? normalizeDomainQuery(entry) : null))
    .filter((entry): entry is string => Boolean(entry))

  if (!queries.length) {
    return res.status(400).json({ message: 'Provide query or queries (domain name or label)' })
  }

  const years = typeof body.years === 'number' && body.years >= 1 && body.years <= 10 ? body.years : 1

  try {
    const results = await searchDomainsForProject({ claims, ref, queries, years })
    return res.status(200).json({ results, years })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Domain search failed'
    const status = message.toLowerCase().includes('not found') ? 404 : 500
    return res.status(status).json({ message })
  }
}
