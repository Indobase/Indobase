import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'
import { components } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { getProjectSettings, getProjectSettingsForRef } from 'lib/api/saas/settings'

type ProjectAppConfig = components['schemas']['ProjectSettingsResponse']['app_config'] & {
  protocol?: string
}
export type ProjectSettings = components['schemas']['ProjectSettingsResponse'] & {
  app_config?: ProjectAppConfig
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

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
  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : ''
  if (ref) {
    const response = await getProjectSettingsForRef({ claims: claims!, ref })
    if (!response) return res.status(404).json({ message: 'Project not found' })
    return res.status(200).json(response)
  }

  const response = getProjectSettings()
  return res.status(200).json(response)
}
