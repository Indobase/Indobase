/**
 * GoTrue URL for server-side Studio → control-plane auth calls.
 * Prefer direct container access to bypass Kong when the public gateway anon key is misconfigured.
 */
export function resolveDirectGotrueUrl(): string {
  const candidates = [
    process.env.GOTRUE_DIRECT_URL,
    process.env.GOTRUE_INTERNAL_URL,
    'http://indobase-auth:9999',
    process.env.KONG_INTERNAL_GOTRUE_URL,
    process.env.GOTRUE_URL,
    process.env.NEXT_PUBLIC_GOTRUE_URL,
  ]

  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const url = raw.replace(/\/$/, '')
    // Kong paths include /auth/v1 — direct GoTrue does not.
    if (url.endsWith('/auth/v1')) {
      return url
    }
    return url
  }

  return 'http://indobase-auth:9999'
}

export function gotrueUserUrl(base: string): string {
  const normalized = base.replace(/\/$/, '')
  return normalized.endsWith('/auth/v1') ? `${normalized}/user` : `${normalized}/user`
}

export function gotrueVerifyUrl(base: string): string {
  const normalized = base.replace(/\/$/, '')
  return normalized.endsWith('/auth/v1') ? `${normalized}/verify` : `${normalized}/verify`
}
