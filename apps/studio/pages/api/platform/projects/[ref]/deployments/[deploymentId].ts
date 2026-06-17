import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { apiAuthenticate } from 'lib/api/apiAuthenticate'
import apiWrapper, { isResponseOk } from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  getProjectDeployment,
  hasValidProjectDeploymentRuntimeToken,
  renewProjectDeploymentHeartbeat,
  type ProjectDeploymentLogLevel,
  type ProjectDeploymentLogSource,
  type ProjectDeploymentStatus,
  updateProjectDeployment,
} from 'lib/api/saas/deployments'

type UpdateDeploymentBody = {
  heartbeat?: boolean
  last_error?: string | null
  log_level?: ProjectDeploymentLogLevel
  log_message?: string
  metadata_patch?: Record<string, unknown>
  source?: ProjectDeploymentLogSource
  status?: ProjectDeploymentStatus
  worker_id?: string
}

const deploymentDetailHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler)

export default deploymentDetailHandler

async function handler(req: NextApiRequest, res: NextApiResponse, _claims?: JwtPayload) {
  setNoStore(res)

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  const deploymentId =
    typeof req.query.deploymentId === 'string' ? req.query.deploymentId.trim() : ''

  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  if (!deploymentId) {
    return res.status(400).json({ message: 'Deployment id is required' })
  }

  switch (req.method) {
    case 'GET': {
      const claims = await authenticateUser(req, res)
      if (!claims) return

      const deployment = await getProjectDeployment({ claims, deploymentId, ref })

      if (!deployment) {
        return res.status(404).json({ message: 'Deployment not found' })
      }

      return res.status(200).json(deployment)
    }
    case 'PATCH': {
      if (!hasValidProjectDeploymentRuntimeToken(req.headers)) {
        return res.status(401).json({ message: 'Unauthorized runtime deployment update' })
      }

      const body = (req.body || {}) as UpdateDeploymentBody
      if (body.heartbeat && body.status && body.status !== 'building') {
        return res.status(400).json({ message: 'Heartbeat updates cannot change deployment status' })
      }

      if (
        !body.heartbeat &&
        !body.status &&
        !body.log_message &&
        !body.metadata_patch &&
        body.last_error === undefined
      ) {
        return res.status(400).json({ message: 'At least one deployment update field is required' })
      }

      if (body.heartbeat) {
        const deployment = await renewProjectDeploymentHeartbeat({
          deploymentId,
          logLevel: body.log_level,
          logMessage: body.log_message,
          metadataPatch: body.metadata_patch,
          ref,
          source: body.source ?? 'runtime',
          workerId: body.worker_id,
        })

        return res.status(200).json(deployment)
      }

      const deployment = await updateProjectDeployment({
        deploymentId,
        lastError: body.last_error,
        logLevel: body.log_level,
        logMessage: body.log_message,
        metadataPatch: body.metadata_patch,
        ref,
        source: body.source ?? 'runtime',
        status: body.status,
      })

      return res.status(200).json(deployment)
    }
    default:
      res.setHeader('Allow', ['GET', 'PATCH'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
}

async function authenticateUser(req: NextApiRequest, res: NextApiResponse) {
  const claims = await apiAuthenticate(req, res)

  if (!isResponseOk(claims)) {
    res.status(401).json({
      error: {
        message: `Unauthorized: ${claims.error.message}`,
      },
    })
    return null
  }

  return claims
}
