import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  createProjectApiKey,
  listProjectApiKeys,
  parseRevealQuery,
} from 'lib/api/saas/project-api-keys'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)
  const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })

  const reveal = parseRevealQuery(req.query.reveal)

  switch (req.method) {
    case 'GET': {
      try {
        const keys = await listProjectApiKeys({ claims: claims as any, ref, reveal })
        return res.status(200).json(keys)
      } catch (err) {
        return sendError(res, err)
      }
    }
    case 'POST': {
      const body = parseBody(req.body)
      if (body === null) return res.status(400).json({ message: 'Invalid JSON body' })
      if (typeof body?.name !== 'string' || !body.name.trim()) {
        return res.status(400).json({ message: 'name is required' })
      }
      if (body?.type !== 'publishable' && body?.type !== 'secret') {
        return res.status(400).json({ message: 'type must be publishable or secret' })
      }
      try {
        const created = await createProjectApiKey({
          claims: claims as any,
          ref,
          reveal: parseRevealQuery(req.query.reveal) || true,
          body: {
            name: body.name,
            description: typeof body.description === 'string' ? body.description : null,
            type: body.type,
            secret_jwt_template: body.secret_jwt_template ?? null,
          },
        })
        return res.status(201).json(created)
      } catch (err) {
        return sendError(res, err)
      }
    }
    default: {
      res.setHeader('Allow', ['GET', 'POST'])
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
        : message.includes('already exists') || message.includes('must')
          ? 400
          : 500
  return res.status(status).json({ message })
}
