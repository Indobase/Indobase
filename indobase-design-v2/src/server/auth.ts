/**
 * Studio SSO — verifies the handoff JWT Studio already mints for Indobase Design and exchanges it
 * for a session cookie.
 *
 * Deliberately consumes the EXISTING contract from
 * `apps/studio/lib/api/saas/design-launch.ts` (aud=indobase-design, HS256 over
 * DESIGN_HANDOFF_SECRET), so replacing the Penpot engine with this one requires no Studio change.
 *
 * Unlike the Penpot fork, no OIDC shim is needed: that existed only because Penpot's Clojure backend
 * would trust nothing but an OIDC provider. Here the backend is ours, so we verify the JWT directly
 * — fewer moving parts and one less container.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'

export type DesignRole = 'owner' | 'admin' | 'developer' | 'viewer'

export type StudioClaims = {
  sub: string
  email: string
  project_ref: string
  organization_slug: string
  organization_name?: string
  role: DesignRole
  exp: number
  iat: number
  aud: string
}

/** Session attached to every authenticated request. */
export type Session = {
  gotrueId: string
  email: string
  projectRef: string
  orgSlug: string
  role: DesignRole
  /** Viewers may read but not mutate. */
  canEdit: boolean
}

const AUDIENCE = 'indobase-design'
const SESSION_COOKIE = 'indobase_design_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12
const EDIT_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'developer'])

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

/**
 * The shared secret with Studio. Fails closed: a short/missing secret must never silently downgrade
 * to "no auth" — that would expose every tenant's designs.
 */
export function resolveHandoffSecret(): string {
  const secret = (process.env.DESIGN_HANDOFF_SECRET || process.env.STUDIO_HANDOFF_SECRET || '').trim()
  if (secret.length < 32) {
    throw new Error('DESIGN_HANDOFF_SECRET missing or shorter than 32 chars')
  }
  return secret
}

function verifyHs256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts

  const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  const actual = b64urlDecode(sigB64)
  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    return JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Verify a Studio handoff token. Returns null on any failure — callers must treat null as denied. */
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
  // Role must be one Studio actually grants; an absent/unknown role is denied rather than defaulted.
  if (!['owner', 'admin', 'developer', 'viewer'].includes(role)) return null

  // Keys mirror the JWT claim names exactly (project_ref, not projectRef) so this stays a faithful
  // representation of what Studio signed.
  return {
    sub,
    email,
    project_ref: projectRef,
    organization_slug: typeof payload.organization_slug === 'string' ? payload.organization_slug : '',
    organization_name:
      typeof payload.organization_name === 'string' ? payload.organization_name : undefined,
    role: role as DesignRole,
    exp,
    iat: typeof payload.iat === 'number' ? payload.iat : now,
    aud: AUDIENCE,
  }
}

/** Mint our own signed session cookie value (independent of the short-lived handoff token). */
export function createSessionToken(claims: StudioClaims, secret: string): string {
  const now = Math.floor(Date.now() / 1000)
  const body = {
    sub: claims.sub,
    email: claims.email,
    project_ref: claims.project_ref,
    org_slug: claims.organization_slug,
    role: claims.role,
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
    return {
      gotrueId: p.sub,
      email: p.email,
      projectRef: p.project_ref,
      orgSlug: p.org_slug ?? '',
      role: p.role,
      canEdit: EDIT_ROLES.has(p.role),
    }
  } catch {
    return null
  }
}

export function sessionCookie(token: string): string {
  // Secure + HttpOnly + SameSite=Lax: the handoff is a top-level navigation from Studio, so Lax is
  // sufficient and avoids the CSRF surface of SameSite=None.
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

export { SESSION_COOKIE, AUDIENCE }
