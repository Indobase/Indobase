import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { listVercelProjectsForIntegration } from 'lib/api/saas/vercel-integration'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type ResponseData =
  paths['/platform/integrations/vercel/projects/{organization_integration_id}']['get']['responses']['200']['content']['application/json']

function parseIntegrationId(req: NextApiRequest): number | null {
  const raw = req.query.organization_integration_id
  const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (!claims) {
    return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }

  const organizationIntegrationId = parseIntegrationId(req)
  if (!organizationIntegrationId) {
    return res.status(400).json({ message: 'organization_integration_id is required' } as any)
  }

  const limit = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 1000
  const from = req.query.from ? Number.parseInt(String(req.query.from), 10) : undefined
  const search = typeof req.query.search === 'string' ? req.query.search : undefined

  try {
    const payload = await listVercelProjectsForIntegration({
      claims: claims as any,
      organizationIntegrationId,
      limit: Number.isFinite(limit) ? limit : 1000,
      from: Number.isFinite(from!) ? from : undefined,
      search,
    })
    return res.status(200).json(payload as ResponseData)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list Vercel projects'
    return res.status(400).json({ message } as any)
  }
}
