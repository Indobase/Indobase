import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import type { components } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import {
  createGitHubConnectionForOrganization,
  listGitHubConnectionsForOrganization,
} from 'lib/api/saas/github-integration'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type ResponseData =
  paths['/platform/integrations/github/connections']['get']['responses']['200']['content']['application/json']

function parseOrganizationId(req: NextApiRequest): number | null {
  const raw = req.query.organization_id
  const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (!claims) {
    return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, claims)
    case 'POST':
      return handlePost(req, res, claims)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
}

const handleGet = async (
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
  claims: JwtPayload
) => {
  const organizationId = parseOrganizationId(req)
  if (!organizationId) {
    return res.status(400).json({ message: 'organization_id is required' } as any)
  }

  const payload = await listGitHubConnectionsForOrganization({
    claims: claims as any,
    organizationId,
  })
  return res.status(200).json(payload)
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse, claims: JwtPayload) => {
  const raw = req.body
  const body = (typeof raw === 'string' ? JSON.parse(raw) : raw) as components['schemas']['CreateGitHubConnectionBody']

  try {
    const created = await createGitHubConnectionForOrganization({
      claims: claims as any,
      body,
    })
    return res.status(201).json(created)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create GitHub connection'
    return res.status(400).json({ message })
  }
}
