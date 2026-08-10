import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { enforcePublicAuthRateLimits } from 'lib/api/rate-limit'
import { requireOsApiSecret } from 'lib/api/saas/os-api-auth'
import { osIdentityErrorStatus, verifyOsIdentityOtp } from 'lib/api/saas/os-identity'

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
    keyPrefix: 'os-identity-otp-verify',
    ipMax: 20,
    ipWindowMs: 60_000,
    email,
    message: 'Too many verification attempts. Please wait a minute and try again.',
  })
  if (!allowed) return

  const name = typeof payload.name === 'string' ? payload.name : ''
  const token = typeof payload.token === 'string' ? payload.token : ''

  try {
    const session = await verifyOsIdentityOtp({ name, email: email || '', token })
    return res.status(200).json({ ok: true, session })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    return res.status(osIdentityErrorStatus(error)).json({ message })
  }
}
