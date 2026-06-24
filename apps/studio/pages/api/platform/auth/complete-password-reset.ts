import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { enforcePublicAuthRateLimits } from 'lib/api/rate-limit'
import { gotrueUserUrl, resolveDirectGotrueUrl } from 'lib/gotrue-direct-url'

/**
 * Proxies GoTrue `PUT /user` for password recovery via direct GoTrue
 * (bypasses Kong when the public api.indobase.in gateway rejects anon keys).
 * The client must send `Authorization: Bearer <recovery_access_token>`.
 */
export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'PUT':
      return handlePut(req, res)
    default:
      res.setHeader('Allow', ['PUT'])
      return res
        .status(405)
        .json({ error: { message: `Method ${method} Not Allowed` }, data: null })
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const allowed = enforcePublicAuthRateLimits(req, res, {
    keyPrefix: 'platform-complete-password-reset',
    ipMax: 10,
    ipWindowMs: 60_000,
  })
  if (!allowed) return

  const authorization = req.headers.authorization
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ message: 'Invalid authentication credentials' })
  }

  let payload: { password?: unknown } = req.body ?? {}
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      payload = {}
    }
  }

  const password = typeof payload.password === 'string' ? payload.password : ''
  if (!password) {
    return res.status(400).json({ message: 'Password is required' })
  }

  const gotrueBase = resolveDirectGotrueUrl()
  const userUrl = gotrueUserUrl(gotrueBase)

  const timeoutMs = parseInt(process.env.GOTRUE_USER_UPDATE_TIMEOUT_MS || '8000', 10)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(userUrl, {
      method: 'PUT',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
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
        'Failed to save password'

      return res.status(response.status).json({
        ...(json ?? {}),
        message,
      })
    }

    return res.status(response.status).json(json ?? {})
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(502).json({
      message: 'Failed to reach GoTrue user update endpoint',
      error: message,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}
