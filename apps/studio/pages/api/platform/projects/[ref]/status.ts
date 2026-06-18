import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { getProjectLifecycleStatus } from 'lib/api/saas/project-lifecycle'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  try {
    const status = await getProjectLifecycleStatus({ claims, ref })
    return res.status(200).json(status)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load project status'
    if (message.includes('not found')) return res.status(404).json({ message })
    return res.status(500).json({ message })
  }
}
