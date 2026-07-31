import type { Context, Next } from 'hono'

import { calendarFrameOrigins } from './calendar.js'
import { meetingsPermissionOrigins } from './meetings.js'

/**
 * Baseline transport / framing protections for public product bridges.
 * frame-ancestors 'none' — Workspace chrome is top-level. Document engine paths
 * must NOT get X-Frame-Options DENY: the editor iframes `/ds` (and native
 * `/web-apps` / `/sdkjs` …) same-origin into our page.
 */
export function isDocumentEnginePath(pathname: string): boolean {
  if (pathname === '/ds' || pathname.startsWith('/ds/')) {
    // Welcome landing is Indobase HTML (not the editor iframe target).
    if (
      pathname === '/ds' ||
      pathname === '/ds/' ||
      pathname === '/ds/welcome' ||
      pathname.startsWith('/ds/welcome/')
    ) {
      return false
    }
    return true
  }
  return (
    pathname.startsWith('/web-apps') ||
    pathname.startsWith('/sdkjs') ||
    pathname.startsWith('/sdkjs-plugins') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/coauthoring') ||
    pathname.startsWith('/cache') ||
    pathname.startsWith('/doceditor') ||
    pathname.startsWith('/dictionaries') ||
    pathname.startsWith('/converter') ||
    pathname.startsWith('/downloadas') ||
    pathname.startsWith('/common/') ||
    pathname === '/healthcheck'
  )
}

function permissionsPolicy(): string {
  const meet = meetingsPermissionOrigins()
    .map((o) => `"${o}"`)
    .join(' ')
  // Allow Meet iframe to use camera/mic; Workspace itself does not capture A/V.
  return `camera=(self ${meet}), microphone=(self ${meet}), geolocation=()`
}

export async function securityHeaders(c: Context, next: Next) {
  await next()
  const pathname = new URL(c.req.url).pathname
  const enginePath = isDocumentEnginePath(pathname)

  c.res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('Permissions-Policy', permissionsPolicy())

  if (enginePath) {
    // Allow same-origin iframe embedding of the document engine.
    c.res.headers.delete('X-Frame-Options')
    c.res.headers.set(
      'Content-Security-Policy',
      "frame-ancestors 'self' https://workspace.indobase.in https://workspace.indobase.fun https://suite.indobase.in"
    )
  } else {
    c.res.headers.set('X-Frame-Options', 'DENY')
    const frameOrigins = [...meetingsPermissionOrigins(), ...calendarFrameOrigins()].join(' ')
    c.res.headers.set(
      'Content-Security-Policy',
      `frame-ancestors 'none'; frame-src 'self' ${frameOrigins} blob:`
    )
  }
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
