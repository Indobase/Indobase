import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { adminDeleteProject, listAllProjectsAdmin } from 'lib/api/saas/platform-admin'
import { parsePagination, platformAdminHandler } from './_helpers'

export default platformAdminHandler(async (req, res, claims: JwtPayload) => {
  if (req.method === 'GET') {
    const { limit, offset, search } = parsePagination(req)

    try {
      return res.status(200).json(await listAllProjectsAdmin({ search, limit, offset }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list projects'
      return res.status(500).json({ message })
    }
  }

  if (req.method === 'DELETE') {
    const ref = typeof req.query.ref === 'string' ? req.query.ref : ''
    if (!ref) {
      return res.status(400).json({ message: 'Project ref is required' })
    }

    try {
      const ok = await adminDeleteProject({ claims: claims as JwtPayload & Record<string, unknown>, ref })
      if (!ok) return res.status(404).json({ message: 'Project not found' })
      return res.status(200).json({ ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete project'
      return res.status(500).json({ message })
    }
  }

  res.setHeader('Allow', ['GET', 'DELETE'])
  return res.status(405).json({ message: 'Method not allowed' })
})
