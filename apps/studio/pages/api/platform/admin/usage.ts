import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { getPlatformAdminUsageReport } from 'lib/api/saas/platform-admin'
import { parseUsageDays, platformAdminHandler } from './_helpers'

export default platformAdminHandler(async (req, res, _claims: JwtPayload) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const days = parseUsageDays(req)

  try {
    return res.status(200).json(await getPlatformAdminUsageReport({ days }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load usage report'
    return res.status(500).json({ message })
  }
})
