import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { listAllProjectsAdmin } from 'lib/api/saas/platform-admin'
import { parsePagination, platformAdminHandler } from './_helpers'

export default platformAdminHandler(async (req, res, _claims: JwtPayload) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { limit, offset, search } = parsePagination(req)

  try {
    return res.status(200).json(await listAllProjectsAdmin({ search, limit, offset }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list projects'
    return res.status(500).json({ message })
  }
})
