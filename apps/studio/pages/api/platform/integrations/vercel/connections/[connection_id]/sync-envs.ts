import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { syncVercelConnectionEnvironments } from 'lib/api/saas/vercel-integration'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

function parseConnectionId(req: NextApiRequest): number | null {
  const raw = req.query.connection_id
  const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (!claims) {
    return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }

  const connectionId = parseConnectionId(req)
  if (!connectionId) {
    return res.status(400).json({ message: 'connection_id is required' })
  }

  try {
    await syncVercelConnectionEnvironments({ claims: claims as any, connectionId })
    return res.status(201).end()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to sync environment variables to Vercel'
    return res.status(400).json({ message })
  }
}
