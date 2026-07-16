import type { NextApiRequest, NextApiResponse } from 'next'

import {
  builderMcpClaimsToJwtPayload,
  readBearerToken,
  verifyBuilderMcpToken,
} from 'lib/api/saas/builder-mcp-auth'
import { setNoStore } from 'lib/api/no-store'
import { getProjectDeployment } from 'lib/api/saas/deployments'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  const deploymentId =
    typeof req.query.deploymentId === 'string' ? req.query.deploymentId.trim() : ''

  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  if (!deploymentId) {
    return res.status(400).json({ message: 'Deployment id is required' })
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

  try {
    const deployment = await getProjectDeployment({
      claims: builderMcpClaimsToJwtPayload(builderClaims),
      deploymentId,
      ref,
    })

    if (!deployment) {
      return res.status(404).json({ message: 'Deployment not found' })
    }

    return res.status(200).json(deployment)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load deployment'
    return res.status(400).json({ message })
  }
}
