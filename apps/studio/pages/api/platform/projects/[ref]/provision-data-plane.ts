import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { provisionTenantDataPlaneStack } from 'lib/api/saas/tenant-data-plane-provision'

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

  let apply = true
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
    if (body && typeof body === 'object' && body.apply === false) apply = false
  } catch {
    return res.status(400).json({ message: 'Invalid JSON body' })
  }

  try {
    const result = await provisionTenantDataPlaneStack({
      claims,
      ref,
      apply,
      reason: 'manual',
    })
    return res.status(200).json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Provisioner request failed'
    if (message.includes('not configured')) {
      return res.status(503).json({ message })
    }
    if (message.includes('No dedicated tenant database')) {
      return res.status(404).json({ message })
    }
    return res.status(502).json({ message })
  }
}
