import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { listIntegrationRowsForOrganization } from 'lib/api/saas/platform'

/**
 * `slug` in this route is the **organization slug** (see `integrations-query-org-only.ts`).
 * Returns persisted rows from saas.integration_connections when present.
 */
export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

type ResponseData =
  paths['/platform/integrations/{slug}']['get']['responses']['200']['content']['application/json']

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req
  const orgSlug = typeof req.query.slug === 'string' ? req.query.slug : Array.isArray(req.query.slug) ? req.query.slug[0] : ''

  switch (method) {
    case 'GET':
      if (!orgSlug) {
        return res.status(400).json({ data: null, error: { message: 'Organization slug is required' } })
      }
      return handleGet(req, res, claims, orgSlug)
    default:
      res.setHeader('Allow', ['GET'])
      return res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (
  _req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
  claims: JwtPayload | undefined,
  orgSlug: string
) => {
  const rows = await listIntegrationRowsForOrganization({ claims: claims as any, orgSlug })
  const payload = rows.map((r) => {
    const name = r.integration_slug.toLowerCase() === 'vercel' ? 'Vercel' : 'GitHub'
    return {
      id: String(r.id),
      added_by: { id: '0', username: 'system', primary_email: 'system@localhost' },
      inserted_at: r.inserted_at,
      updated_at: r.updated_at,
      connections: [] as const,
      organization: { slug: orgSlug },
      integration: { name },
      metadata: (r.connection ?? {}) as Record<string, unknown>,
    }
  })
  return res.status(200).json(payload as unknown as ResponseData)
}
