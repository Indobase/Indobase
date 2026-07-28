/**
 * Studio SSO — verifies handoff JWT from Studio (`aud=indobase-helpdesk`, HS256).
 * Same contract as `apps/studio/lib/api/saas/product-handoff.ts`.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type HelpdeskRole = 'owner' | 'admin' | 'developer' | 'viewer'

export type StudioClaims = {
  sub: string
  email: string
  project_ref: string
  organization_slug: string
  organization_name?: string
  project_name?: string
  role: HelpdeskRole
  studio_url?: string
  exp: number
  iat: number
  aud: string
}

export type Session = {
  gotrueId: string
  email: string
  projectRef: string
  orgSlug: string
  projectName?: string
  organizationName?: string
  role: HelpdeskRole
  canEdit: boolean
  isAgent: boolean
  studioUrl: string
}

export const AUDIENCE = 'indobase-helpdesk'
export const SESSION_COOKIE = 'indobase_helpdesk_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 12

const AGENT_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'developer'])

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

export function resolveHandoffSecret(): string {
  const secret = (
    process.env.HELPDESK_HANDOFF_SECRET ||
    process.env.STUDIO_HANDOFF_SECRET ||
    ''
  ).trim()
  if (secret.length < 32) {
    throw new Error('HELPDESK_HANDOFF_SECRET missing or shorter than 32 chars')
  }
  return secret
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

export function verifyStudioHandoff(token: string, secret: string): StudioClaims | null {
  const payload = verifyHs256(token, secret)
  if (!payload) return null

  const now = Math.floor(Date.now() / 1000)
  const exp = typeof payload.exp === 'number' ? payload.exp : 0
  if (!exp || exp < now) return null
  if (payload.aud !== AUDIENCE) return null

  const sub = typeof payload.sub === 'string' ? payload.sub : ''
  const email = typeof payload.email === 'string' ? payload.email : ''
  const projectRef = typeof payload.project_ref === 'string' ? payload.project_ref : ''
  const role = typeof payload.role === 'string' ? payload.role : ''
  if (!sub || !email || !projectRef) return null
  if (!['owner', 'admin', 'developer', 'viewer'].includes(role)) return null

  return {
    sub,
    email,
    project_ref: projectRef,
    organization_slug:
      typeof payload.organization_slug === 'string' ? payload.organization_slug : '',
    organization_name:
      typeof payload.organization_name === 'string' ? payload.organization_name : undefined,
    project_name: typeof payload.project_name === 'string' ? payload.project_name : undefined,
    role: role as HelpdeskRole,
    studio_url: typeof payload.studio_url === 'string' ? payload.studio_url : undefined,
    exp,
    iat: typeof payload.iat === 'number' ? payload.iat : now,
    aud: AUDIENCE,
  }
}

export function createSessionToken(claims: StudioClaims, secret: string): string {
  const now = Math.floor(Date.now() / 1000)
  const body = {
    sub: claims.sub,
    email: claims.email,
    project_ref: claims.project_ref,
    org_slug: claims.organization_slug,
    project_name: claims.project_name,
    organization_name: claims.organization_name,
    role: claims.role,
    studio_url: claims.studio_url,
    exp: now + SESSION_TTL_SECONDS,
    jti: randomBytes(8).toString('hex'),
  }
  const payloadB64 = b64urlEncode(JSON.stringify(body))
  const sig = createHmac('sha256', secret).update(payloadB64).digest()
  return `${payloadB64}.${b64urlEncode(sig)}`
}

export function readSessionToken(value: string, secret: string): Session | null {
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts
  const expected = createHmac('sha256', secret).update(payloadB64).digest()
  const actual = b64urlDecode(sigB64)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const p = JSON.parse(b64urlDecode(payloadB64).toString('utf8'))
    if (typeof p.exp !== 'number' || p.exp < Math.floor(Date.now() / 1000)) return null
    const studioUrl =
      (typeof p.studio_url === 'string' && p.studio_url) ||
      (process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
    const role = p.role as HelpdeskRole
    return {
      gotrueId: p.sub,
      email: p.email,
      projectRef: p.project_ref,
      orgSlug: p.org_slug ?? '',
      projectName: typeof p.project_name === 'string' ? p.project_name : undefined,
      organizationName: typeof p.organization_name === 'string' ? p.organization_name : undefined,
      role,
      canEdit: AGENT_ROLES.has(role),
      isAgent: AGENT_ROLES.has(role),
      studioUrl,
    }
  } catch {
    return null
  }
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

export function readCookie(header: string | undefined | null, name = SESSION_COOKIE): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=')
  }
  return null
}
