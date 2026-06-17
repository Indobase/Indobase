import type { JwtPayload } from '@indobaseinc/indobase-js'
import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { getSaaSProjectPropsApiPayload } from 'lib/api/saas/platform'
import { DEFAULT_PROJECT } from 'lib/constants/api'
import { IS_SAAS } from 'lib/constants'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: IS_SAAS })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res, claims)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) => {
  if (IS_SAAS) {
    if (!claims) {
      return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
    }
    const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
    if (!ref) {
      return res.status(400).json({ data: null, error: { message: 'Project ref is required' } })
    }
    try {
      const payload = await getSaaSProjectPropsApiPayload({ claims, ref })
      if (!payload) {
        return res.status(404).json({ data: null, error: { message: 'Project not found' } })
      }
      return res.status(200).json({
        project: {
          ...payload.project,
          services: [],
        },
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load project props'
      return res.status(500).json({ data: null, error: { message } })
    }
  }

  const response = {
    project: {
      ...DEFAULT_PROJECT,
      services: [],
    },
  }

  return res.status(200).json(response)
}
