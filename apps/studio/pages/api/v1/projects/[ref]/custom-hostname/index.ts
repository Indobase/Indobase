import type { JwtPayload } from '@supabase/supabase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  deleteCustomDomain,
  getCustomDomain,
} from 'lib/api/self-hosted/custom-domains'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  switch (req.method) {
    case 'GET': {
      try {
        const result = await getCustomDomain({ claims: claims as any, ref })
        if (!result) {
          return res.status(404).json({
            message: 'custom hostname configuration not found',
          })
        }
        return res.status(200).json(result)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return res.status(500).json({ message })
      }
    }
    case 'DELETE': {
      try {
        await deleteCustomDomain({ claims: claims as any, ref })
        return res.status(204).end()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return res.status(500).json({ message })
      }
    }
    default: {
      res.setHeader('Allow', ['GET', 'DELETE'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
    }
  }
}
