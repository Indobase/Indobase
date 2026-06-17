import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import type { components } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import {
  deleteGitHubConnectionForOrganization,
  updateGitHubConnectionForOrganization,
} from 'lib/api/saas/github-integration'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

function parseConnectionId(req: NextApiRequest): number | null {
  const raw = req.query.connection_id
  const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (!claims) {
    return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
  }

  const connectionId = parseConnectionId(req)
  if (!connectionId) {
    return res.status(400).json({ message: 'connection_id is required' })
  }

  switch (req.method) {
    case 'PATCH':
      return handlePatch(req, res, claims, connectionId)
    case 'DELETE':
      return handleDelete(res, claims, connectionId)
    default:
      res.setHeader('Allow', ['PATCH', 'DELETE'])
      return res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
}

const handlePatch = async (
  req: NextApiRequest,
  res: NextApiResponse,
  claims: JwtPayload,
  connectionId: number
) => {
  const raw = req.body
  const body = (typeof raw === 'string' ? JSON.parse(raw) : raw) as components['schemas']['UpdateGitHubConnectionBody']
  const updated = await updateGitHubConnectionForOrganization({
    claims: claims as any,
    connectionId,
    patch: body,
  })
  if (!updated) {
    return res.status(404).json({ message: 'GitHub connection not found' })
  }
  return res.status(204).end()
}

const handleDelete = async (
  res: NextApiResponse,
  claims: JwtPayload,
  connectionId: number
) => {
  const removed = await deleteGitHubConnectionForOrganization({
    claims: claims as any,
    connectionId,
  })
  if (!removed) {
    return res.status(404).json({ message: 'GitHub connection not found' })
  }
  return res.status(204).end()
}
