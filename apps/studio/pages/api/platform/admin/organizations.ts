import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import {
  adminDeleteOrganization,
  listAllOrganizationsAdmin,
} from 'lib/api/saas/platform-admin'
import { parsePagination, platformAdminHandler } from './_helpers'

export default platformAdminHandler(async (req, res, claims: JwtPayload) => {
  if (req.method === 'GET') {
    const { limit, offset, search } = parsePagination(req)

    try {
      return res.status(200).json(await listAllOrganizationsAdmin({ search, limit, offset }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list organizations'
      return res.status(500).json({ message })
    }
  }

  if (req.method === 'DELETE') {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
    if (!slug) {
      return res.status(400).json({ message: 'Organization slug is required' })
    }

    try {
      const ok = await adminDeleteOrganization({ claims: claims as JwtPayload & Record<string, unknown>, slug })
      if (!ok) return res.status(404).json({ message: 'Organization not found' })
      return res.status(200).json({ ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete organization'
      return res.status(500).json({ message })
    }
  }

  res.setHeader('Allow', ['GET', 'DELETE'])
  return res.status(405).json({ message: 'Method not allowed' })
})
