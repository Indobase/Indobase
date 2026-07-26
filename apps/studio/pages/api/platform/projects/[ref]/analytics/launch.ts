import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import {
  ANALYTICS_ROLE_DENIED_CODE,
  getAnalyticsLaunchRedirect,
  isAnalyticsRoleDeniedMessage,
} from 'lib/api/saas/analytics-launch'

const analyticsLaunchHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

export default analyticsLaunchHandler

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
    const response = await getAnalyticsLaunchRedirect({
      claims,
      ref: ref.trim(),
    })

    return res.status(200).json({
      token: response.token,
      url: response.url,
      project_ref: response.project.ref,
      organization_slug: response.project.organization_slug,
      role: response.role,
      mapping: response.mapping,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch Analytics'
    if (isAnalyticsRoleDeniedMessage(message)) {
      return res.status(403).json({
        code: ANALYTICS_ROLE_DENIED_CODE,
        message:
          'Ask an organization owner or admin to grant you Analytics access. Developers and viewers can open Analytics once they are members of this organization.',
      })
    }
    const status = message.toLowerCase().includes('not found')
      ? 404
      : message.toLowerCase().includes('secret')
        ? 503
        : 500
    return res.status(status).json({ message })
  }
}
