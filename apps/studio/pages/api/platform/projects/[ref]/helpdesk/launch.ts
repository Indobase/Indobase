import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import {
  HELPDESK_ROLE_DENIED_CODE,
  getHelpdeskLaunchRedirect,
  isHelpdeskRoleDeniedMessage,
} from 'lib/api/saas/helpdesk-launch'

const helpdeskLaunchHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

export default helpdeskLaunchHandler

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
    const response = await getHelpdeskLaunchRedirect({
      claims,
      ref: ref.trim(),
    })

    return res.status(200).json({
      token: response.token,
      url: response.url,
      project_ref: response.project.ref,
      organization_slug: response.project.organization_slug,
      helpdesk_team_key: response.helpdeskTeamKey,
      helpdesk_queue_key: response.helpdeskQueueKey,
      role: response.role,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch Helpdesk'
    if (isHelpdeskRoleDeniedMessage(message)) {
      return res.status(403).json({
        code: HELPDESK_ROLE_DENIED_CODE,
        message:
          'Ask an organization owner or admin to grant you Helpdesk access. Developers and viewers can open Helpdesk once they are members of this organization.',
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
