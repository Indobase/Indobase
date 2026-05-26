import { NextApiRequest, NextApiResponse } from 'next'

import type { JwtPayload } from 'indobase-js'

import apiWrapper from 'lib/api/apiWrapper'
import { getBuilderLaunchRedirect } from 'lib/api/saas/builder-launch'

const builderLaunchHandler = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

export default builderLaunchHandler

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

  const response = await getBuilderLaunchRedirect({ claims, ref: ref.trim() })

  return res.status(200).json({
    backend: response.backend,
    token: response.token,
    url: response.url,
    project_ref: response.project.ref,
    organization_slug: response.project.organization_slug,
  })
}
