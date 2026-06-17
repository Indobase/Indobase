import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { setNoStore } from 'lib/api/no-store'
import { assertPlatformOperator } from 'lib/api/saas/platform-operator'

export function platformAdminHandler(
  handler: (req: NextApiRequest, res: NextApiResponse, claims: JwtPayload) => Promise<void>
) {
  return (req: NextApiRequest, res: NextApiResponse) =>
    apiWrapper(req, res, async (req, res, claims) => {
      setNoStore(res)
      try {
        assertPlatformOperator(claims as JwtPayload & Record<string, unknown>)
      } catch {
        return res.status(403).json({ message: 'Forbidden: platform operator access required' })
      }
      return handler(req, res, claims as JwtPayload)
    }, { withAuth: true })
}

export function parsePagination(req: NextApiRequest) {
  const limit = Math.min(
    Math.max(parseInt(typeof req.query.limit === 'string' ? req.query.limit : '50', 10) || 50, 1),
    200
  )
  const offset = Math.max(
    parseInt(typeof req.query.offset === 'string' ? req.query.offset : '0', 10) || 0,
    0
  )
  const search = typeof req.query.search === 'string' ? req.query.search : undefined
  return { limit, offset, search }
}

export function parseUsageDays(req: NextApiRequest, defaultDays = 30) {
  const raw = typeof req.query.days === 'string' ? req.query.days : String(defaultDays)
  const days = parseInt(raw, 10)
  return Math.min(Math.max(Number.isFinite(days) ? days : defaultDays, 1), 90)
}
