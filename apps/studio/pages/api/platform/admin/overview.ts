import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { getPlatformAdminOverview } from 'lib/api/saas/platform-admin'
import { platformAdminHandler } from './_helpers'

export default platformAdminHandler(async (req, res, _claims: JwtPayload) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    return res.status(200).json(await getPlatformAdminOverview())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load overview'
    return res.status(500).json({ message })
  }
})
