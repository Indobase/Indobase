import type { NextApiRequest, NextApiResponse } from 'next'

import {
  builderMcpClaimsToJwtPayload,
  readBearerToken,
  verifyBuilderMcpToken,
} from 'lib/api/saas/builder-mcp-auth'
import { getProjectLifecycleStatus } from 'lib/api/saas/project-lifecycle'
import { ensureTenantDataPlaneHealthy } from 'lib/api/saas/tenant-data-plane-provision'
import { isTenantDataPlaneReachable } from 'lib/api/saas/tenant-data-plane-health'
import { setNoStore } from 'lib/api/no-store'
import { executeQuery } from 'lib/api/saas/query'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  const token = readBearerToken(req.headers.authorization)
  if (!token) {
    return res.status(401).json({ message: 'Builder authorization token is required' })
  }

  let builderClaims
  try {
    builderClaims = verifyBuilderMcpToken(token)
  } catch (error) {
    return res.status(401).json({
      message: error instanceof Error ? error.message : 'Invalid Builder authorization token',
    })
  }

  if (builderClaims.project_ref !== ref) {
    return res.status(403).json({ message: 'Builder token does not match this project' })
  }

  const claims = builderMcpClaimsToJwtPayload(builderClaims)

  try {
    const { status: projectStatus } = await getProjectLifecycleStatus({ claims, ref })

    if (projectStatus === 'INACTIVE') {
      return res.status(409).json({
        ready: false,
        projectStatus,
        message: 'Project is paused. Restore it in Studio before publishing from Builder.',
      })
    }

    const dataPlane = await ensureTenantDataPlaneHealthy({
      claims,
      ref,
      reason: 'builder_preflight',
      force: false,
    })

    const portRow = await executeQuery<{ data_plane_port_base: number | null }>({
      query: `
        select data_plane_port_base
        from saas.projects
        where ref = $1
        limit 1
      `,
      parameters: [ref],
      actorId: builderClaims.sub,
    })

    const portBase = portRow.data?.[0]?.data_plane_port_base ?? null
    const reachable = portBase ? await isTenantDataPlaneReachable(ref, portBase) : true

    const ready =
      projectStatus === 'ACTIVE_HEALTHY' || projectStatus === 'RESTARTING'
        ? reachable || Boolean(dataPlane.repaired)
        : false

    return res.status(ready ? 200 : 503).json({
      ready,
      projectStatus,
      dataPlane: {
        ...dataPlane,
        reachable,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend preflight failed'
    return res.status(500).json({ ready: false, message })
  }
}
