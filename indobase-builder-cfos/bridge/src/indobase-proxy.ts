/**
 * Session-authenticated proxy to the linked Indobase project API.
 * Supports managed records backend (rewrites legacy /rest/v1 + /auth/v1) and preserves user Bearer tokens.
 */
import type { Context } from 'hono'

import type { Session } from './auth.js'
import {
  collectionPrefix,
  isManagedPublicKey,
  physicalCollectionName,
  sanitizeAppId,
} from './pocketbase/managed.js'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'cookie',
  'apikey',
])

function isManagedSessionBackend(session: Session): boolean {
  const b = session.backend
  if (!b) return false
  if (isManagedPublicKey(b.anon_key)) return true
  if (b.public_env?.INDOBASE_BACKEND_KIND === 'records') return true
  if ((b.rest_url || '').includes('/api/collections')) return true
  return false
}

/**
 * Map PostgREST/GoTrue-shaped paths onto PocketBase records/auth when session is managed.
 */
export function rewriteManagedBackendPath(
  path: string,
  projectRef: string,
): string {
  const appId = sanitizeAppId(projectRef)
  const prefix = collectionPrefix(appId)

  let p = path.startsWith('/') ? path : `/${path}`

  // /rest/v1/{table} → /api/collections/ib_{app}_{table}/records
  const rest = p.match(/^\/rest\/v1\/([^/?#]+)(.*)$/i)
  if (rest) {
    const logical = decodeURIComponent(rest[1])
    const physical = logical.startsWith(prefix)
      ? logical
      : physicalCollectionName(appId, logical)
    return `/api/collections/${physical}/records${rest[2] || ''}`
  }

  // /auth/v1/otp → users request-otp / auth-with-otp (best-effort)
  if (/^\/auth\/v1\/otp\/?$/i.test(p) || /^\/auth\/v1\/otp\/start/i.test(p)) {
    return '/api/collections/users/request-otp'
  }
  if (/^\/auth\/v1\/otp\/verify/i.test(p) || /^\/auth\/v1\/verify/i.test(p)) {
    return '/api/collections/users/auth-with-otp'
  }
  if (/^\/auth\/v1\/user/i.test(p)) {
    return '/api/collections/users/records'
  }
  if (/^\/auth\/v1\/?/i.test(p)) {
    return p.replace(/^\/auth\/v1/i, '/api/collections/users')
  }

  // Bare logical collection under /api/collections/{logical}/records → physical
  const col = p.match(/^\/api\/collections\/([^/?#]+)(\/records.*)?$/i)
  if (col) {
    const name = decodeURIComponent(col[1])
    if (name !== 'users' && name !== '_superusers' && !name.startsWith('ib_')) {
      const physical = physicalCollectionName(appId, name)
      return `/api/collections/${physical}${col[2] || ''}`
    }
  }

  return p
}

/** Map GoTrue-style OTP verify bodies onto PocketBase auth-with-otp. */
export function rewriteManagedOtpVerifyBody(
  path: string,
  rawBody: string,
): string | null {
  if (!/auth-with-otp/i.test(path)) return null
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return null
  }
  const otpId =
    (typeof parsed.otpId === 'string' && parsed.otpId) ||
    (typeof parsed.otp_id === 'string' && parsed.otp_id) ||
    (typeof parsed.id === 'string' && parsed.id) ||
    ''
  const password =
    (typeof parsed.password === 'string' && parsed.password) ||
    (typeof parsed.token === 'string' && parsed.token) ||
    (typeof parsed.otp === 'string' && parsed.otp) ||
    (typeof parsed.code === 'string' && parsed.code) ||
    ''
  if (!otpId || !password) return null
  return JSON.stringify({ otpId, password })
}

export async function proxyIndobaseApi(
  c: Context,
  session: Session,
  opts: { stripPrefix: string },
) {
  if (!session.backend?.api_url || !session.backend.anon_key) {
    return c.json({ message: 'No Indobase backend on this session' }, 400)
  }

  const url = new URL(c.req.url)
  let path = url.pathname
  if (path.startsWith(opts.stripPrefix)) {
    path = path.slice(opts.stripPrefix.length) || '/'
  }
  if (!path.startsWith('/')) path = `/${path}`

  const managed = isManagedSessionBackend(session)
  if (managed && session.backend.project_ref) {
    path = rewriteManagedBackendPath(path, session.backend.project_ref)
  }

  const base = session.backend.api_url.replace(/\/+$/, '')
  const target = new URL(path + url.search, `${base}/`)

  const clientAuth = c.req.header('authorization') || c.req.header('Authorization') || ''

  const headers = new Headers()
  c.req.raw.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower)) return
    if (lower === 'authorization') return // set explicitly below
    headers.set(key, value)
  })

  if (clientAuth.trim()) {
    // PocketBase accepts raw or Bearer; normalize so managed writes keep user JWT.
    headers.set(
      'Authorization',
      clientAuth.toLowerCase().startsWith('bearer ')
        ? clientAuth
        : `Bearer ${clientAuth.trim()}`,
    )
  } else if (!managed) {
    headers.set('apikey', session.backend.anon_key)
    headers.set('Authorization', `Bearer ${session.backend.anon_key}`)
  }
  // Managed public reads: no apikey; authenticated writes need client Bearer.

  headers.set('host', target.host)
  headers.delete('accept-encoding')

  const init: RequestInit = {
    method: c.req.method,
    headers,
    redirect: 'manual',
  }
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const contentType = (c.req.header('content-type') || '').toLowerCase()
    if (managed && contentType.includes('application/json')) {
      const raw = await c.req.text()
      const rewritten = rewriteManagedOtpVerifyBody(path, raw)
      init.body = rewritten || raw
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json')
      }
    } else {
      init.body = c.req.raw.body
      // @ts-expect-error duplex for streaming
      init.duplex = 'half'
    }
  }

  try {
    const upstream = await fetch(target, init)
    const out = new Headers()
    upstream.headers.forEach((value, key) => {
      if (HOP_BY_HOP.has(key.toLowerCase())) return
      out.set(key, value)
    })
    // Help browsers calling from published origins when upstream omits CORS
    if (!out.has('access-control-allow-origin')) {
      const origin = c.req.header('origin')
      if (origin) {
        out.set('access-control-allow-origin', origin)
        out.set('vary', 'Origin')
        out.set('access-control-allow-credentials', 'true')
      }
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    })
  } catch (err) {
    return c.json(
      {
        message: err instanceof Error ? err.message : 'Indobase API unreachable',
      },
      502,
    )
  }
}
