import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { buildIndiaRegionsInfo } from 'lib/api/saas/india-regions'
import { setNoStore } from 'lib/api/no-store'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res)

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const cloudProvider = (req.query.cloud_provider as string) || 'AWS'
  if (!['AWS', 'FLY', 'AWS_K8S', 'AWS_NIMBUS'].includes(cloudProvider)) {
    return res.status(400).json({ message: 'Invalid cloud_provider' })
  }

  const organizationSlug = typeof req.query.organization_slug === 'string' ? req.query.organization_slug : ''
  if (!organizationSlug) {
    return res.status(400).json({ message: 'organization_slug is required' })
  }

  return res
    .status(200)
    .json(buildIndiaRegionsInfo(cloudProvider as 'AWS' | 'FLY' | 'AWS_K8S' | 'AWS_NIMBUS'))
}
