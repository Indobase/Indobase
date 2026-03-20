import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import type { AuditLog } from 'data/organizations/organization-audit-logs-query'

// Minimal implementation to support Studio profile audit log UI in self-hosted mode.
// The current `platform` schema doesn’t include an audit log table, so we return an empty result.
export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      res.status(200).json({
        result: [] as AuditLog[],
        retention_period: 0,
      })
      return
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
}

