import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  deleteProjectApiKeyById,
  getProjectApiKeyById,
  parseRevealQuery,
  updateProjectApiKeyById,
} from 'lib/api/saas/project-api-keys'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!ref || !id) return res.status(400).json({ message: 'ref and id are required' })

  const reveal = parseRevealQuery(req.query.reveal)

  switch (req.method) {
    case 'GET': {
      try {
        const key = await getProjectApiKeyById({ claims: claims as any, ref, id, reveal })
        return res.status(200).json(key)
      } catch (err) {
        return sendError(res, err)
      }
    }
    case 'PATCH': {
      const body = parseBody(req.body)
      if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })
      try {
        const updated = await updateProjectApiKeyById({
          claims: claims as any,
          ref,
          id,
          reveal,
          body: {
            description: typeof body.description === 'string' ? body.description : null,
          },
        })
        return res.status(200).json(updated)
      } catch (err) {
        return sendError(res, err)
      }
    }
    case 'DELETE': {
      try {
        const ok = await deleteProjectApiKeyById({ claims: claims as any, ref, id })
        if (!ok) return res.status(404).json({ message: 'API key not found' })
        return res.status(204).end()
      } catch (err) {
        return sendError(res, err)
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

function sendError(res: NextApiResponse, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error'
  const status =
    message.includes('not found') || message.includes('Not found')
      ? 404
      : message.includes('permissions') || message.includes('session')
        ? 403
        : message.includes('cannot') || message.includes('must')
          ? 400
          : 500
  return res.status(status).json({ message })
}
