import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import {
  adminApplyOrganizationPlatformPatch,
  getPlatformAdminOrganizationDetail,
  type PlatformOrgAdminPatchInput,
} from 'lib/api/saas/platform-admin'
import { platformAdminHandler } from '../_helpers'

const parseBody = (body: NextApiRequest['body']): unknown => {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }
  return body ?? null
}

export default platformAdminHandler(async (req, res, claims: JwtPayload) => {
  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) {
    return res.status(400).json({ message: 'Organization slug is required' })
  }

  if (req.method === 'GET') {
    try {
      const detail = await getPlatformAdminOrganizationDetail(slug)
      if (!detail) return res.status(404).json({ message: 'Organization not found' })
      return res.status(200).json(detail)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load organization'
      return res.status(500).json({ message })
    }
  }

  if (req.method === 'PATCH') {
    const raw = parseBody(req.body)
    if (raw === null || typeof raw !== 'object') {
      return res.status(400).json({ message: 'Invalid JSON body' })
    }
    try {
      const updated = await adminApplyOrganizationPlatformPatch({
        claims: claims as JwtPayload & Record<string, unknown>,
        slug,
        patch: raw as PlatformOrgAdminPatchInput,
      })
      if (!updated) return res.status(404).json({ message: 'Organization not found' })
      return res.status(200).json(updated)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update organization'
      const status = message.includes('must') || message.includes('Invalid') ? 400 : 500
      return res.status(status).json({ message })
    }
  }

  res.setHeader('Allow', ['GET', 'PATCH'])
  return res.status(405).json({ message: 'Method not allowed' })
})
