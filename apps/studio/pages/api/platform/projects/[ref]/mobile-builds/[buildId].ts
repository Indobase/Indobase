import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { apiAuthenticate } from 'lib/api/apiAuthenticate'
import apiWrapper, { isResponseOk } from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  getProjectMobileBuild,
  hasValidProjectMobileBuildRuntimeToken,
  renewProjectMobileBuildHeartbeat,
  type CreateProjectMobileBuildArtifact,
  type ProjectMobileBuildLogLevel,
  type ProjectMobileBuildLogSource,
  type ProjectMobileBuildStatus,
  updateProjectMobileBuild,
} from 'lib/api/saas/mobile-builds'

type UpdateMobileBuildBody = {
  artifacts?: CreateProjectMobileBuildArtifact[]
  heartbeat?: boolean
  last_error?: string | null
  log_level?: ProjectMobileBuildLogLevel
  log_message?: string
  metadata_patch?: Record<string, unknown>
  source?: ProjectMobileBuildLogSource
  status?: ProjectMobileBuildStatus
  worker_id?: string
}

const mobileBuildDetailHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler)

export default mobileBuildDetailHandler

async function handler(req: NextApiRequest, res: NextApiResponse, _claims?: JwtPayload) {
  setNoStore(res)

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  const buildId = typeof req.query.buildId === 'string' ? req.query.buildId.trim() : ''

  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  if (!buildId) {
    return res.status(400).json({ message: 'Build id is required' })
  }

  switch (req.method) {
    case 'GET': {
      const claims = await authenticateUser(req, res)
      if (!claims) return

      const build = await getProjectMobileBuild({ buildId, claims, ref })

      if (!build) {
        return res.status(404).json({ message: 'Mobile build not found' })
      }

      return res.status(200).json(build)
    }
    case 'PATCH': {
      if (!hasValidProjectMobileBuildRuntimeToken(req.headers)) {
        return res.status(401).json({ message: 'Unauthorized runtime mobile build update' })
      }

      const body = (req.body || {}) as UpdateMobileBuildBody
      if (body.heartbeat && body.status && body.status !== 'building') {
        return res.status(400).json({ message: 'Heartbeat updates cannot change mobile build status' })
      }

      if (
        !body.heartbeat &&
        !body.status &&
        !body.log_message &&
        !body.metadata_patch &&
        !body.artifacts?.length &&
        body.last_error === undefined
      ) {
        return res.status(400).json({ message: 'At least one mobile build update field is required' })
      }

      if (body.heartbeat) {
        const build = await renewProjectMobileBuildHeartbeat({
          buildId,
          logLevel: body.log_level,
          logMessage: body.log_message,
          metadataPatch: body.metadata_patch,
          ref,
          source: body.source ?? 'runtime',
          workerId: body.worker_id,
        })

        return res.status(200).json(build)
      }

      const build = await updateProjectMobileBuild({
        artifacts: body.artifacts,
        buildId,
        lastError: body.last_error,
        logLevel: body.log_level,
        logMessage: body.log_message,
        metadataPatch: body.metadata_patch,
        ref,
        source: body.source ?? 'runtime',
        status: body.status,
      })

      return res.status(200).json(build)
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
