import type { NextApiRequest, NextApiResponse } from 'next'
import type { JwtPayload } from '@indobaseinc/indobase-js'

import domainsApiWrapper from 'lib/api/domainsApiWrapper'
import { listProjectDomainRegistrations } from 'lib/api/saas/domains-service'

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

  try {
    const registrations = await listProjectDomainRegistrations({ claims, ref })
    return res.status(200).json({ registrations })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list domains'
    const status = message.toLowerCase().includes('not found') ? 404 : 500
    return res.status(status).json({ message })
  }
}
