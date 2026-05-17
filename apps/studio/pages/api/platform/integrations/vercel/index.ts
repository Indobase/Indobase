import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

import type { components } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import {
  createVercelIntegration,
  isVercelOAuthConfigured,
} from 'lib/api/saas/vercel-integration'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse, claims?: JwtPayload) {
  if (!claims) {
    return res.status(401).json({ data: null, error: { message: 'Unauthorized' } })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }

  if (!isVercelOAuthConfigured()) {
    return res.status(503).json({
      message:
        'Vercel OAuth is not configured. Set VERCEL_CLIENT_ID and VERCEL_CLIENT_SECRET on Studio.',
    })
  }

  const raw = req.body
  const body = (typeof raw === 'string' ? JSON.parse(raw) : raw) as components['schemas']['CreateVercelIntegrationBody']

  try {
    const created = await createVercelIntegration({ claims: claims as any, body })
    return res.status(201).json(created)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Vercel integration'
    return res.status(400).json({ message })
  }
}
