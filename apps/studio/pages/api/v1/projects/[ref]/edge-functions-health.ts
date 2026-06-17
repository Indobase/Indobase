import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { IS_SAAS } from 'lib/constants'
import { getSaaSEdgeFunctionsHealth } from 'lib/api/saas/project-health'

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

  if (IS_SAAS && claims) {
    try {
      const health = await getSaaSEdgeFunctionsHealth({
        claims: claims as JwtPayload & Record<string, any>,
        ref,
      })

      if (!health) {
        return res.status(404).json({ message: 'Project not found' })
      }

      return res.status(200).json(health)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to check edge functions health'
      return res.status(500).json({ message })
    }
  }

  return res.status(200).json({ healthy: true })
}
