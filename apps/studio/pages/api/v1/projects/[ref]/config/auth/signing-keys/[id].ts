import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  deleteProjectSigningKey,
  getProjectSigningKey,
  updateProjectSigningKey,
} from 'lib/api/saas/signing-keys'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  const keyId = typeof req.query.id === 'string' ? req.query.id : ''
  if (!ref || !keyId) return res.status(400).json({ message: 'Project ref and key id are required' })

  switch (req.method) {
    case 'GET': {
      try {
        const key = await getProjectSigningKey({ claims: claims as any, ref, keyId })
        return res.status(200).json(key)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        const status = message.includes('not found') ? 404 : 500
        return res.status(status).json({ message })
      }
    }
    case 'PATCH': {
      const body = parseBody(req.body)
      if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })
      try {
        const updated = await updateProjectSigningKey({
          claims: claims as any,
          ref,
          keyId,
          body: { status: body?.status },
        })
        return res.status(200).json(updated)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return res.status(400).json({ message })
      }
    }
    case 'DELETE': {
      try {
        await deleteProjectSigningKey({ claims: claims as any, ref, keyId })
        return res.status(204).end()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return res.status(400).json({ message })
      }
    }
    default: {
      res.setHeader('Allow', ['GET', 'PATCH', 'DELETE'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
    }
  }
}

function parseBody(body: unknown) {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body as string)
  } catch {
    return null
  }
}
