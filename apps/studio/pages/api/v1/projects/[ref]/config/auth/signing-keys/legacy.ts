import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  getLegacyProjectSigningKey,
  migrateLegacyProjectSigningKey,
} from 'lib/api/saas/signing-keys'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  switch (req.method) {
    case 'GET': {
      try {
        const key = await getLegacyProjectSigningKey({ claims: claims as any, ref })
        return res.status(200).json(key)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        const status = message.includes('not found') ? 404 : 500
        return res.status(status).json({ message })
      }
    }
    case 'POST': {
      try {
        const created = await migrateLegacyProjectSigningKey({ claims: claims as any, ref })
        return res.status(201).json(created)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return res.status(400).json({ message })
      }
    }
    default: {
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
    }
  }
}
