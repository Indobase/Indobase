import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import {
  getSuiteLaunchRedirect,
  isSuiteRoleDeniedMessage,
  SUITE_ROLE_DENIED_CODE,
} from 'lib/api/saas/suite-launch'

const suiteLaunchHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

export default suiteLaunchHandler

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const { ref, module } = req.query
  if (typeof ref !== 'string' || !ref.trim()) {
    return res.status(400).json({ message: 'Project ref is required' })
  }

  if (!claims) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const moduleParam = typeof module === 'string' ? module.trim() : undefined

  try {
    const response = await getSuiteLaunchRedirect({
      claims,
      ref: ref.trim(),
      module: moduleParam,
    })

    return res.status(200).json({
      token: response.token,
      url: response.url,
      project_ref: response.project.ref,
      organization_slug: response.project.organization_slug,
      suite_team_key: response.suiteTeamKey,
      suite_project_key: response.suiteProjectKey,
      role: response.role,
      module: response.module ?? moduleParam ?? null,
      external_product: response.externalProduct ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch Workspace'
    if (isSuiteRoleDeniedMessage(message)) {
      return res.status(403).json({
        code: SUITE_ROLE_DENIED_CODE,
        message:
          'Ask an organization owner or admin to grant you Workspace access. Developers and viewers can open Workspace once they are members of this organization.',
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
