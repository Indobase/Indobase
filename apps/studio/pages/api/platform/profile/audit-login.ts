import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'

// Minimal implementation to support Studio login event tracking in SaaS mode.
// This app currently doesn't persist audit logs in the `platform` schema, so we no-op.
export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'POST':
      res.status(201).json({})
      return
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
}

