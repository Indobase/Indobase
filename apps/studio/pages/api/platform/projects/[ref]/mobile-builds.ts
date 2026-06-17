import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import {
  createProjectMobileBuild,
  listProjectMobileBuilds,
  type ProjectMobileBuildFramework,
  type ProjectMobileBuildProfile,
  type ProjectMobileBuildRequestedVia,
  type ProjectMobileBuildTarget,
} from 'lib/api/saas/mobile-builds'

type CreateMobileBuildBody = {
  framework?: ProjectMobileBuildFramework
  metadata?: Record<string, unknown>
  profile?: ProjectMobileBuildProfile
  requested_via?: ProjectMobileBuildRequestedVia
  target?: ProjectMobileBuildTarget
}

const mobileBuildsHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

export default mobileBuildsHandler

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  setNoStore(res)

  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''

  if (!ref) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  if (!claims) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  switch (req.method) {
    case 'GET': {
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined
      const builds = await listProjectMobileBuilds({ claims, limit, ref })
      return res.status(200).json({ builds })
    }
    case 'POST': {
      const body = (req.body || {}) as CreateMobileBuildBody
      const build = await createProjectMobileBuild({
        claims,
        framework: body.framework,
        metadata: body.metadata,
        profile: body.profile,
        ref,
        requestedVia: body.requested_via ?? 'studio',
        target: body.target,
      })
      return res.status(201).json(build)
    }
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
}
