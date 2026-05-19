import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { listProblemProjectsAdmin } from 'lib/api/saas/platform-admin'
import { platformAdminHandler } from './_helpers'

export default platformAdminHandler(async (req, res, _claims: JwtPayload) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const raw = typeof req.query.limit === 'string' ? req.query.limit : '100'
  const limit = Math.min(Math.max(parseInt(raw, 10) || 100, 1), 200)

  try {
    return res.status(200).json(await listProblemProjectsAdmin({ limit }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list problem projects'
    return res.status(500).json({ message })
  }
})
