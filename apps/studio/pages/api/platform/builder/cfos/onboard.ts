import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { enforcePublicAuthRateLimits } from 'lib/api/rate-limit'
import {
  startBuilderCfosOnboard,
  verifyBuilderCfosBridgeSecret,
  verifyBuilderCfosOnboard,
} from 'lib/api/saas/builder-cfos-onboard'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      return res
        .status(405)
        .json({ error: { message: `Method ${method} Not Allowed` }, data: null })
  }
}

function readBridgeSecret(req: NextApiRequest): string | null {
  const raw = req.headers['x-indobase-builder-cfos-secret']
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim()
  return null
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  if (!verifyBuilderCfosBridgeSecret(readBridgeSecret(req))) {
    return res.status(401).json({ message: 'Unauthorized bridge request' })
  }

  let payload: Record<string, unknown> = req.body ?? {}
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload) as Record<string, unknown>
    } catch {
      payload = {}
    }
  }

  const action = typeof payload.action === 'string' ? payload.action.trim() : ''
  const email = typeof payload.email === 'string' ? payload.email : null
  const allowed = enforcePublicAuthRateLimits(req, res, {
    keyPrefix: `builder-cfos-onboard-${action || 'unknown'}`,
    ipMax: action === 'verify' ? 20 : 10,
    ipWindowMs: 60_000,
    email,
  })
  if (!allowed) return

  const name = typeof payload.name === 'string' ? payload.name : ''
  const dpdpConsent = payload.dpdpConsent === true
  const token = typeof payload.token === 'string' ? payload.token : ''

  try {
    if (action === 'start') {
      const result = await startBuilderCfosOnboard({ name, email: email || '', dpdpConsent })
      return res.status(200).json({ ok: true, ...result })
    }

    if (action === 'verify') {
      const session = await verifyBuilderCfosOnboard({
        name,
        email: email || '',
        token,
      })
      return res.status(200).json({ ok: true, session })
    }

    return res.status(400).json({ message: 'action must be start or verify' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onboarding failed'
    const status = message.includes('consent') ? 400 : message.includes('required') ? 400 : 502
    return res.status(status).json({ message })
  }
}
