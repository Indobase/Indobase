import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { enforcePublicAuthRateLimits } from 'lib/api/rate-limit'
import { gotrueVerifyUrl, resolveDirectGotrueUrl } from 'lib/gotrue-direct-url'

/**
 * Proxies GoTrue `POST /verify` for recovery/signup OTP flows using direct GoTrue
 * (bypasses Kong when the public api.indobase.in gateway rejects anon keys).
 */
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

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  let payload: Record<string, unknown> = req.body ?? {}
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      payload = {}
    }
  }

  const email = typeof payload.email === 'string' ? payload.email : undefined
  const allowed = enforcePublicAuthRateLimits(req, res, {
    keyPrefix: 'platform-verify-otp',
    ipMax: 20,
    ipWindowMs: 60_000,
    email,
  })
  if (!allowed) return

  const type = payload.type
  if (typeof type !== 'string' || !type) {
    return res.status(400).json({ message: 'Verification type is required' })
  }

  const hasTokenHash = typeof payload.token_hash === 'string' && payload.token_hash.length > 0
  const hasEmailToken =
    typeof payload.email === 'string' &&
    payload.email.length > 0 &&
    typeof payload.token === 'string' &&
    payload.token.length > 0

  if (!hasTokenHash && !hasEmailToken) {
    return res.status(400).json({ message: 'token_hash or email+token is required' })
  }

  const gotrueBase = resolveDirectGotrueUrl()
  const verifyUrl = gotrueVerifyUrl(gotrueBase)

  const timeoutMs = parseInt(process.env.GOTRUE_VERIFY_TIMEOUT_MS || '8000', 10)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const text = await response.text()
    let json: Record<string, unknown> | null = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }

    if (!response.ok) {
      const message =
        (typeof json?.msg === 'string' && json.msg) ||
        (typeof json?.message === 'string' && json.message) ||
        (typeof json?.error_description === 'string' && json.error_description) ||
        text ||
        'Verification failed'

      return res.status(response.status).json({
        ...(json ?? {}),
        message,
      })
    }

    return res.status(response.status).json(json ?? {})
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(502).json({
      message: 'Failed to reach GoTrue verify endpoint',
      error: message,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}
