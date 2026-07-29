import type { NextApiRequest, NextApiResponse } from 'next'

export const STUDIO_REFRESH_TOKEN_COOKIE = 'indobase-studio-refresh-token'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function buildRefreshTokenCookie(refreshToken: string, secure: boolean): string {
  const parts = [
    `${STUDIO_REFRESH_TOKEN_COOKIE}=${encodeURIComponent(refreshToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ONE_YEAR_SECONDS}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function buildClearRefreshTokenCookie(secure: boolean): string {
  const parts = [
    `${STUDIO_REFRESH_TOKEN_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function readRefreshTokenFromRequest(req: NextApiRequest): string | null {
  const raw = req.cookies[STUDIO_REFRESH_TOKEN_COOKIE]
  if (!raw || typeof raw !== 'string') return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function isSecureRequest(req: NextApiRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return false
  const forwarded = req.headers['x-forwarded-proto']
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() === 'https'
  return false
}

export function setRefreshTokenCookie(
  res: NextApiResponse,
  refreshToken: string,
  secure: boolean
): void {
  res.setHeader('Set-Cookie', buildRefreshTokenCookie(refreshToken, secure))
}

export function clearRefreshTokenCookie(res: NextApiResponse, secure: boolean): void {
  res.setHeader('Set-Cookie', buildClearRefreshTokenCookie(secure))
}
