import type { NextApiRequest, NextApiResponse } from 'next'

import {
  builderMcpClaimsToJwtPayload,
  readBearerToken,
  verifyBuilderMcpToken,
} from 'lib/api/saas/builder-mcp-auth'
import { setNoStore } from 'lib/api/no-store'
import { createProjectDeployment } from 'lib/api/saas/deployments'
import { publishDeploymentArtifacts } from 'lib/api/saas/deployment-artifacts'

type CreateDeploymentBody = {
  artifacts?: Record<string, string>
  metadata?: Record<string, unknown>
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
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

  const body = (req.body || {}) as CreateDeploymentBody

  try {
    const deployment = await createProjectDeployment({
      claims: builderMcpClaimsToJwtPayload(builderClaims),
      metadata: {
        ...body.metadata,
        builder_session: true,
        requested_from: 'indobase-builder',
        artifact_count: body.artifacts ? Object.keys(body.artifacts).length : 0,
      },
      ref,
      requestedVia: 'builder',
    })

    if (body.artifacts && Object.keys(body.artifacts).length > 0) {
      const manifest = await publishDeploymentArtifacts({
        claims: builderMcpClaimsToJwtPayload(builderClaims),
        deploymentId: deployment.id,
        files: body.artifacts,
        ref,
      })

      return res.status(201).json({
        ...deployment,
        metadata: {
          ...deployment.metadata,
          hosting_artifacts: manifest,
        },
        target_url: manifest.published_url,
      })
    }

    return res.status(201).json(deployment)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to queue deployment'
    const status = message.includes('already in progress') ? 409 : 400
    return res.status(status).json({ message })
  }
}
