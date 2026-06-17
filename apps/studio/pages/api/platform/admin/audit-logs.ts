import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import type { PlatformAdminAuditLogFilters } from 'lib/api/saas/platform-admin'
import { listAllAuditLogsAdmin } from 'lib/api/saas/platform-admin'
import { parsePagination, platformAdminHandler } from './_helpers'

function parseAuditFilters(req: NextApiRequest): PlatformAdminAuditLogFilters {
  const q = req.query
  const orgRaw = typeof q.organization_id === 'string' ? q.organization_id : ''
  const orgId = orgRaw ? parseInt(orgRaw, 10) : NaN
  return {
    search: typeof q.search === 'string' ? q.search : undefined,
    action: typeof q.action === 'string' ? q.action : undefined,
    actor_gotrue_id: typeof q.actor_gotrue_id === 'string' ? q.actor_gotrue_id : undefined,
    organization_id: Number.isFinite(orgId) ? orgId : undefined,
    project_ref: typeof q.project_ref === 'string' ? q.project_ref : undefined,
    from: typeof q.from === 'string' ? q.from : undefined,
    to: typeof q.to === 'string' ? q.to : undefined,
  }
}

export default platformAdminHandler(async (req, res, _claims: JwtPayload) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { limit, offset } = parsePagination(req)
  const filters = parseAuditFilters(req)

  try {
    return res.status(200).json(await listAllAuditLogsAdmin({ limit, offset, filters }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list audit logs'
    return res.status(500).json({ message })
  }
})
