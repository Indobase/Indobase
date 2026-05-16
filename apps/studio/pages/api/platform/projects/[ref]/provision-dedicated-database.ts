import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { provisionDedicatedTenantDatabaseForProject } from 'lib/api/saas/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  try {
    const result = await provisionDedicatedTenantDatabaseForProject({ claims, ref })
    return res.status(200).json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes('Project not found')) {
      return res.status(404).json({ message })
    }
    if (message.includes('POSTGRES_HOST') || message.includes('POSTGRES_PASSWORD')) {
      return res.status(503).json({ message })
    }
    return res.status(500).json({ message })
  }
}
