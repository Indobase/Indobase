import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  createEdgeFunctionSecrets,
  deleteEdgeFunctionSecrets,
  listEdgeFunctionSecrets,
} from 'lib/api/saas/edge-function-secrets'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) return res.status(400).json({ message: 'Project ref is required' })
  if (!claims) return res.status(401).json({ message: 'Unauthorized' })

  if (!IS_SAAS) {
    return res.status(501).json({ message: 'Edge Function secrets are only supported in SaaS mode' })
  }

  switch (req.method) {
    case 'GET': {
      try {
        const secrets = await listEdgeFunctionSecrets({ claims: claims as any, ref })
        return res.status(200).json(secrets)
      } catch (error) {
        return sendError(res, error)
      }
    }
    case 'POST': {
      const body = parseBody(req.body)
      if (!Array.isArray(body)) {
        return res.status(400).json({ message: 'Request body must be an array of secrets' })
      }
      try {
        await createEdgeFunctionSecrets({
          claims: claims as any,
          ref,
          secrets: body.map((entry) => ({
            name: typeof entry?.name === 'string' ? entry.name : '',
            value: typeof entry?.value === 'string' ? entry.value : '',
          })),
        })
        return res.status(201).end()
      } catch (error) {
        return sendError(res, error)
      }
    }
    case 'DELETE': {
      const body = parseBody(req.body)
      if (!Array.isArray(body)) {
        return res.status(400).json({ message: 'Request body must be an array of secret names' })
      }
      const names = body.filter((entry): entry is string => typeof entry === 'string')
      try {
        await deleteEdgeFunctionSecrets({ claims: claims as any, ref, names })
        return res.status(200).end()
      } catch (error) {
        return sendError(res, error)
      }
    }
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
}

function parseBody(body: unknown): unknown {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '[]')
    } catch {
      return null
    }
  }
  return body ?? []
}

function sendError(res: NextApiResponse, error: unknown) {
  const message = error instanceof Error ? error.message : 'Request failed'
  const status = /not found/i.test(message) ? 404 : /required|must|invalid/i.test(message) ? 400 : 500
  return res.status(status).json({ message })
}
