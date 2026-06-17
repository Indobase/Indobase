import type { NextApiRequest, NextApiResponse } from 'next'

import {
  builderMcpClaimsToJwtPayload,
  readBearerToken,
  verifyBuilderMcpToken,
} from 'lib/api/saas/builder-mcp-auth'
import { setNoStore } from 'lib/api/no-store'
import {
  createProjectMobileBuild,
  type ProjectMobileBuildFramework,
  type ProjectMobileBuildProfile,
  type ProjectMobileBuildTarget,
} from 'lib/api/saas/mobile-builds'

type CreateMobileBuildBody = {
  framework?: ProjectMobileBuildFramework
  metadata?: Record<string, unknown>
  profile?: ProjectMobileBuildProfile
  target?: ProjectMobileBuildTarget
}

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

  const body = (req.body || {}) as CreateMobileBuildBody

  try {
    const build = await createProjectMobileBuild({
      claims: builderMcpClaimsToJwtPayload(builderClaims),
      framework: body.framework,
      metadata: {
        ...body.metadata,
        builder_session: true,
        requested_from: 'indobase-builder',
      },
      profile: body.profile,
      ref,
      requestedVia: 'builder',
      target: body.target,
    })

    return res.status(201).json(build)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to queue mobile build'
    const status = message.includes('already in progress') ? 409 : 400
    return res.status(status).json({ message })
  }
}
