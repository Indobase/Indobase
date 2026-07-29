import { createHmac, timingSafeEqual } from 'node:crypto'

import type { HandoffRole } from './product-handoff'
import { resolveProductHandoffSecret } from './product-handoff'

/** Bearer token audience for Domains app → Studio domains API calls. */
export const DOMAINS_PRODUCT_API_AUD = 'indobase-domains-api' as const

export type DomainsProductTokenPayload = {
  aud: typeof DOMAINS_PRODUCT_API_AUD
  sub: string
  email: string
  project_ref: string
  role: HandoffRole
  exp: number
  iat: number
}

const TOKEN_TTL_SECONDS = 60 * 15

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function verifyHs256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  const actual = b64urlDecode(sigB64)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    return JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export function mintDomainsProductToken(input: {
  sub: string
  email: string
  projectRef: string
  role: HandoffRole
}): string {
  const secret = resolveProductHandoffSecret('domains')
  const now = Math.floor(Date.now() / 1000)
  const payload: DomainsProductTokenPayload = {
    aud: DOMAINS_PRODUCT_API_AUD,
    sub: input.sub,
    email: input.email,
    project_ref: input.projectRef,
    role: input.role,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  }
  const headerB64 = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = b64urlEncode(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const signature = createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64urlEncode(signature)}`
}

export function verifyDomainsProductToken(token: string): DomainsProductTokenPayload | null {
  let secret: string
  try {
    secret = resolveProductHandoffSecret('domains')
  } catch {
    return null
  }

  const payload = verifyHs256(token, secret)
  if (!payload) return null

  const now = Math.floor(Date.now() / 1000)
  const exp = typeof payload.exp === 'number' ? payload.exp : 0
  if (!exp || exp < now) return null
  if (payload.aud !== DOMAINS_PRODUCT_API_AUD) return null

  const sub = typeof payload.sub === 'string' ? payload.sub : ''
  const email = typeof payload.email === 'string' ? payload.email : ''
  const projectRef = typeof payload.project_ref === 'string' ? payload.project_ref : ''
  const role = typeof payload.role === 'string' ? payload.role : ''
  if (!sub || !email || !projectRef) return null
  if (!['owner', 'admin', 'developer', 'viewer'].includes(role)) return null

  return {
    aud: DOMAINS_PRODUCT_API_AUD,
    sub,
    email,
    project_ref: projectRef,
    role: role as HandoffRole,
    exp,
    iat: typeof payload.iat === 'number' ? payload.iat : now,
  }
}
