import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  deleteCustomDomain,
  getCustomDomain,
} from 'lib/api/saas/custom-domains'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) {
    res.status(400).json({ message: 'Project ref is required' })
    return
  }

  switch (req.method) {
    case 'GET': {
      try {
        const result = await getCustomDomain({ claims: claims as any, ref })
        if (!result) {
          res.status(404).json({
            message: 'custom hostname configuration not found',
          })
          return
        }
        res.status(200).json(result)
        return
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        res.status(500).json({ message })
        return
      }
    }
    case 'DELETE': {
      try {
        await deleteCustomDomain({ claims: claims as any, ref })
        res.status(204).end()
        return
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        res.status(500).json({ message })
        return
      }
    }
    default: {
      res.setHeader('Allow', ['GET', 'DELETE'])
      res.status(405).json({ message: `Method ${req.method} Not Allowed` })
      return
    }
  }
}
