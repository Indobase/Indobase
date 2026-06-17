import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  getLegacyApiKeysStatus,
  setLegacyApiKeysEnabled,
} from 'lib/api/saas/project-api-keys'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  switch (req.method) {
    case 'GET': {
      try {
        const status = await getLegacyApiKeysStatus({ claims: claims as any, ref })
        return res.status(200).json(status)
      } catch (err) {
        return sendError(res, err)
      }
    }
    case 'PUT': {
      const enabledRaw = req.query.enabled
      const enabled =
        enabledRaw === true ||
        enabledRaw === 'true' ||
        (typeof enabledRaw === 'string' && enabledRaw.toLowerCase() === 'true')
      try {
        const status = await setLegacyApiKeysEnabled({
          claims: claims as any,
          ref,
          enabled,
        })
        return res.status(200).json(status)
      } catch (err) {
        return sendError(res, err)
      }
    }
    default: {
      res.setHeader('Allow', ['GET', 'PUT'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
    }
  }
}

function sendError(res: NextApiResponse, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error'
  const status =
    message.includes('not found') || message.includes('Not found')
      ? 404
      : message.includes('permissions') || message.includes('session')
        ? 403
        : 500
  return res.status(status).json({ message })
}
