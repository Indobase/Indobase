import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import { adminDeleteUser, adminSetPlatformUserBanned, listAllUsersAdmin } from 'lib/api/saas/platform-admin'
import { parsePagination, platformAdminHandler } from './_helpers'

export default platformAdminHandler(async (req, res, claims: JwtPayload) => {
  if (req.method === 'GET') {
    const { limit, offset, search } = parsePagination(req)

    try {
      return res.status(200).json(await listAllUsersAdmin({ search, limit, offset }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list users'
      return res.status(500).json({ message })
    }
  }

  if (req.method === 'DELETE') {
    const gotrueId = typeof req.query.gotrue_id === 'string' ? req.query.gotrue_id : ''
    if (!gotrueId) {
      return res.status(400).json({ message: 'User gotrue_id is required' })
    }

    try {
      const ok = await adminDeleteUser({
        claims: claims as JwtPayload & Record<string, unknown>,
        gotrueId,
      })
      if (!ok) return res.status(404).json({ message: 'User not found' })
      return res.status(200).json({ ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete user'
      const status = message.includes('Cannot delete') || message.includes('owns') ? 409 : 500
      return res.status(status).json({ message })
    }
  }

  if (req.method === 'PATCH') {
    let body: { gotrue_id?: string; banned?: boolean }
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    } catch {
      return res.status(400).json({ message: 'Invalid JSON body' })
    }
    const gotrueId = typeof body?.gotrue_id === 'string' ? body.gotrue_id : ''
    if (!gotrueId) {
      return res.status(400).json({ message: 'User gotrue_id is required in body' })
    }
    if (typeof body.banned !== 'boolean') {
      return res.status(400).json({ message: 'Field banned (boolean) is required' })
    }

    try {
      await adminSetPlatformUserBanned({
        claims: claims as JwtPayload & Record<string, unknown>,
        gotrueId,
        banned: body.banned,
      })
      return res.status(200).json({ ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update user'
      const status =
        message.includes('Cannot') ||
        message.includes('not found') ||
        message.includes('profile not found')
          ? 400
          : 500
      return res.status(status).json({ message })
    }
  }

  res.setHeader('Allow', ['GET', 'DELETE', 'PATCH'])
  return res.status(405).json({ message: 'Method not allowed' })
})
