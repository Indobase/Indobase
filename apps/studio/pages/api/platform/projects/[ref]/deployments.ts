import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { createProjectDeployment, listProjectDeployments } from 'lib/api/saas/deployments'

type CreateDeploymentBody = {
  metadata?: Record<string, unknown>
  requested_via?: 'studio' | 'builder' | 'api'
}

const deploymentsHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

export default deploymentsHandler

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
      const deployments = await listProjectDeployments({ claims, ref, limit })
      return res.status(200).json({ deployments })
    }
    case 'POST': {
      const body = (req.body || {}) as CreateDeploymentBody
      const deployment = await createProjectDeployment({
        claims,
        metadata: body.metadata,
        ref,
        requestedVia: body.requested_via ?? 'studio',
      })
      return res.status(201).json(deployment)
    }
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
}
