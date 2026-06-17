import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { bulkBackfillTenantDataPlaneBootstrap } from 'lib/api/saas/platform'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: 'Method not allowed' })
  }
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) return res.status(400).json({ message: 'Organization slug is required' })

  try {
    const out = await bulkBackfillTenantDataPlaneBootstrap({ claims, slug })
    if (!out) {
      return res.status(403).json({ message: 'Organization not found or owner/admin role required' })
    }
    return res.status(200).json(out)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ message })
  }
}
