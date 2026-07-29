import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import {
  CRM_ROLE_DENIED_CODE,
  getCrmLaunchRedirect,
  isCrmRoleDeniedMessage,
} from 'lib/api/saas/crm-launch'

const crmLaunchHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

export default crmLaunchHandler

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const { ref } = req.query
  if (typeof ref !== 'string' || !ref.trim()) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  if (!claims) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  try {
    const response = await getCrmLaunchRedirect({
      claims,
      ref: ref.trim(),
    })

    return res.status(200).json({
      token: response.token,
      url: response.url,
      project_ref: response.project.ref,
      organization_slug: response.project.organization_slug,
      crm_team_key: response.crmTeamKey,
      crm_pipeline_key: response.crmPipelineKey,
      role: response.role,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch CRM'
    if (isCrmRoleDeniedMessage(message)) {
      return res.status(403).json({
        code: CRM_ROLE_DENIED_CODE,
        message:
          'Ask an organization owner or admin to grant you CRM access. Developers and viewers can open CRM once they are members of this organization.',
      })
    }
    const status =
      message.toLowerCase().includes('not found')
        ? 404
        : message.toLowerCase().includes('secret')
          ? 503
          : 500
    return res.status(status).json({ message })
  }
}
