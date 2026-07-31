import type { Context, Next } from 'hono'

/**
 * Baseline transport / framing protections for the Meet bridge.
 * Camera/mic allowed for meeting pages; framing denied for SSO chrome.
 */
export async function securityHeaders(c: Context, next: Next) {
  await next()
  c.res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('Content-Security-Policy', "frame-ancestors 'none'")
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/meeting/') || path.startsWith('/engine/')) {
    c.res.headers.set(
      'Permissions-Policy',
      'camera=(self), microphone=(self), display-capture=(self), geolocation=()'
    )
  } else {
    c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  }
}

/** Public health payload — never include upstream hostnames or internal topology. */
export function publicSsoHealth(input: {
  service: string
  audience: string
  versionEnvKeys?: string[]
  extra?: Record<string, unknown>
}) {
  const versionKeys = input.versionEnvKeys ?? ['GIT_SHA', 'MEET_VERSION']
  let version = 'dev'
  for (const key of versionKeys) {
    const value = process.env[key]?.trim()
    if (value && value !== 'dev') {
      version = value
      break
    }
  }
  return {
    ok: true,
    service: input.service,
    audience: input.audience,
    version,
    handoffConfigured: false as boolean,
    ...(input.extra ?? {}),
  }
}
