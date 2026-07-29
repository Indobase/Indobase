import type { NextApiRequest, NextApiResponse } from 'next'

import { resolvePublicGotrueUrlForBrowser, resolveServerPublicAnonKey } from 'common/public-env'

import {
  clearRefreshTokenCookie,
  isSecureRequest,
  readRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from 'lib/studio-auth-cookie'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` })
  }

  const secure = isSecureRequest(req)
  const refreshToken = readRefreshTokenFromRequest(req)

  if (!refreshToken) {
    return res.status(401).json({
      error: 'refresh_token_not_found',
      error_description: 'No refresh token cookie present',
    })
  }

  const gotrueUrl = resolvePublicGotrueUrlForBrowser()
  const anonKey = resolveServerPublicAnonKey()

  if (!gotrueUrl || !anonKey) {
    return res.status(500).json({ error: 'Auth service is not configured' })
  }

  try {
    const response = await fetch(`${gotrueUrl.replace(/\/$/, '')}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearRefreshTokenCookie(res, secure)
      }
      return res.status(response.status).json(payload ?? { error: 'refresh_failed' })
    }

    if (typeof payload?.refresh_token === 'string' && payload.refresh_token.length > 0) {
      setRefreshTokenCookie(res, payload.refresh_token, secure)
    }

    return res.status(200).json(payload)
  } catch (error) {
    console.error('[auth/refresh-session]', error)
    return res.status(502).json({ error: 'Failed to reach auth service' })
  }
}
