import type { Context, Next } from 'hono'

/**
 * Baseline transport / framing protections for public product bridges.
 * frame-ancestors 'none' — Workspace is top-level; the document editor iframes
 * the engine into our page (we are the parent), so this does not block editing.
 */
export async function securityHeaders(c: Context, next: Next) {
  await next()
  c.res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('Content-Security-Policy', "frame-ancestors 'none'")
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

/** Public health payload — never include upstream hostnames or internal topology. */
export function publicSsoHealth(input: {
  service: string
  audience: string
  versionEnvKeys?: string[]
  extra?: Record<string, unknown>
}) {
  const versionKeys = input.versionEnvKeys ?? ['GIT_SHA', 'SUITE_VERSION', 'DISCUSS_VERSION', 'CRM_VERSION', 'HELPDESK_VERSION']
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
