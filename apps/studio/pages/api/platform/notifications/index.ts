import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import {
  listUserNotifications,
  updateUserNotificationStatuses,
} from 'lib/api/saas/user-notifications'

/**
 * User-scoped notifications persisted in saas.user_notifications.
 */
export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

function parseIntParam(v: string | string[] | undefined, fallback: number) {
  const raw = Array.isArray(v) ? v[0] : v
  const n = raw !== undefined ? Number.parseInt(String(raw), 10) : Number.NaN
  return Number.isFinite(n) ? n : fallback
}

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  switch (req.method) {
    case 'GET': {
      const offset = Math.max(0, parseIntParam(req.query.offset as string | undefined, 0))
      const limit = Math.min(100, Math.max(1, parseIntParam(req.query.limit as string | undefined, 20)))
      const status =
        typeof req.query.status === 'string'
          ? req.query.status
          : Array.isArray(req.query.status)
            ? req.query.status.join(',')
            : undefined
      const rows = await listUserNotifications({
        claims: claims as any,
        offset,
        limit,
        status,
      })
      return res.status(200).json(rows)
    }
    case 'PATCH': {
      const raw = req.body
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (!Array.isArray(body)) {
        return res.status(400).json({ message: 'Expected JSON array of { id, status }' })
      }
      const updates = body.map((row: { id?: string; status?: string }) => ({
        id: String(row?.id ?? ''),
        status: row?.status as 'new' | 'seen' | 'archived',
      }))
      if (updates.some((u) => !u.id || !['new', 'seen', 'archived'].includes(u.status))) {
        return res.status(400).json({ message: 'Each item needs id and status new|seen|archived' })
      }
      const rows = await updateUserNotificationStatuses({ claims: claims as any, updates })
      return res.status(200).json(rows)
    }
    default:
      res.setHeader('Allow', ['GET', 'PATCH'])
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
}
