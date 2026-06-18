import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { recordAuditLog } from 'lib/api/saas/audit'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  switch (req.method) {
    case 'POST': {
      await recordAuditLog({
        claims,
        action: 'user.login',
        targetType: 'user',
        targetDescription: 'User signed in to Studio',
        ip: typeof req.headers['x-forwarded-for'] === 'string'
          ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
          : req.socket.remoteAddress ?? null,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      })
      res.status(201).json({})
      return
    }
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
}
