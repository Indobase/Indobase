import type { NextApiRequest, NextApiResponse } from 'next'

import {
  clearRefreshTokenCookie,
  isSecureRequest,
  setRefreshTokenCookie,
} from 'lib/studio-auth-cookie'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const secure = isSecureRequest(req)

  if (req.method === 'POST') {
    const refreshToken = req.body?.refresh_token
    if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
      return res.status(400).json({ error: 'refresh_token is required' })
    }

    setRefreshTokenCookie(res, refreshToken.trim(), secure)
    return res.status(204).end()
  }

  if (req.method === 'DELETE') {
    clearRefreshTokenCookie(res, secure)
    return res.status(204).end()
  }

  res.setHeader('Allow', ['POST', 'DELETE'])
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` })
}
