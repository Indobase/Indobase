import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { enforcePublicAuthRateLimits } from 'lib/api/rate-limit'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { osIdentityErrorStatus, startOsIdentityOtp } from 'lib/api/saas/os-identity'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  if (!requireOsApiSecret(req)) {
    return res.status(401).json({ message: 'Unauthorized OS API request' })
  }

  let payload: Record<string, unknown> = req.body ?? {}
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload) as Record<string, unknown>
    } catch {
      payload = {}
    }
  }

  const email = typeof payload.email === 'string' ? payload.email : null
  const allowed = enforcePublicAuthRateLimits(req, res, {
    keyPrefix: 'os-identity-otp-start',
    ipMax: 10,
    ipWindowMs: 60_000,
    email,
  })
  if (!allowed) return

  const name = typeof payload.name === 'string' ? payload.name : ''
  const dpdpConsent = payload.dpdpConsent === true

  try {
    const result = await startOsIdentityOtp({ name, email: email || '', dpdpConsent })
    return res.status(200).json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send verification code'
    return res.status(osIdentityErrorStatus(error)).json({ message })
  }
}
