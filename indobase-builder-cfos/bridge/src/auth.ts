/**
 * Studio SSO — verifies handoff JWT (`aud=indobase-builder-cfos`, HS256).
 * Mirrors Builder handoff payload shape so Studio can pass backend config.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type BackendConfig = {
  anon_key: string
  api_url: string
  auth_url: string
  project_name: string
  project_ref: string
  project_url: string
  rest_url: string
  storage_url: string
  public_env?: Record<string, string>
}

export type StudioClaims = {
  sub: string
  email: string
  project_ref: string
  organization_slug: string
  project_name?: string
  studio_url?: string
  backend?: BackendConfig
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
  /** Operator display name from OTP / Studio — synced into CFOS profile. */
  displayName?: string
  studioUrl: string
  backend?: BackendConfig
}

export const AUDIENCE = 'indobase-builder-cfos'
export const SESSION_COOKIE = 'indobase_builder_cfos_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 12

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
    process.env.BUILDER_CFOS_HANDOFF_SECRET ||
    process.env.BUILDER_HANDOFF_SECRET ||
    process.env.STUDIO_HANDOFF_SECRET ||
    ''
  ).trim()
  if (secret.length < 32) {
    throw new Error(
      'BUILDER_CFOS_HANDOFF_SECRET (or BUILDER_HANDOFF_SECRET) missing or shorter than 32 chars'
    )
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

function parseBackend(raw: unknown): BackendConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const b = raw as Record<string, unknown>
  const anon = typeof b.anon_key === 'string' ? b.anon_key : ''
  const api = typeof b.api_url === 'string' ? b.api_url : ''
  const projectRef = typeof b.project_ref === 'string' ? b.project_ref : ''
  if (!anon || !api || !projectRef) return undefined
  return {
    anon_key: anon,
    api_url: api,
    auth_url: typeof b.auth_url === 'string' ? b.auth_url : `${api}/auth/v1`,
    project_name: typeof b.project_name === 'string' ? b.project_name : projectRef,
    project_ref: projectRef,
    project_url: typeof b.project_url === 'string' ? b.project_url : '',
    rest_url: typeof b.rest_url === 'string' ? b.rest_url : `${api}/rest/v1/`,
    storage_url: typeof b.storage_url === 'string' ? b.storage_url : `${api}/storage/v1`,
    public_env:
      b.public_env && typeof b.public_env === 'object'
        ? (b.public_env as Record<string, string>)
        : undefined,
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
  if (!sub || !email || !projectRef) return null

  return {
    sub,
    email,
    project_ref: projectRef,
    organization_slug:
      typeof payload.organization_slug === 'string' ? payload.organization_slug : '',
    project_name: typeof payload.project_name === 'string' ? payload.project_name : undefined,
    studio_url: typeof payload.studio_url === 'string' ? payload.studio_url : undefined,
    backend: parseBackend(payload.backend),
    exp,
    iat: typeof payload.iat === 'number' ? payload.iat : now,
    aud: AUDIENCE,
  }
}

export function createSessionToken(session: Session, secret: string): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    ...session,
    exp: now + SESSION_TTL_SECONDS,
    iat: now,
    aud: AUDIENCE,
    nonce: randomBytes(8).toString('hex'),
  }
  const headerB64 = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = b64urlEncode(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const sig = createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64urlEncode(sig)}`
}

export function readSessionToken(token: string, secret: string): Session | null {
  const payload = verifyHs256(token, secret)
  if (!payload) return null
  const now = Math.floor(Date.now() / 1000)
  const exp = typeof payload.exp === 'number' ? payload.exp : 0
  if (!exp || exp < now) return null
  if (payload.aud !== AUDIENCE) return null

  const gotrueId = typeof payload.gotrueId === 'string' ? payload.gotrueId : ''
  const email = typeof payload.email === 'string' ? payload.email : ''
  const projectRef = typeof payload.projectRef === 'string' ? payload.projectRef : ''
  // Guests may have empty email; require gotrueId + projectRef always.
  if (!gotrueId || !projectRef) return null

  return {
    gotrueId,
    email,
    projectRef,
    orgSlug: typeof payload.orgSlug === 'string' ? payload.orgSlug : '',
    projectName: typeof payload.projectName === 'string' ? payload.projectName : undefined,
    displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined,
    studioUrl:
      typeof payload.studioUrl === 'string' ? payload.studioUrl : 'https://studio.indobase.in',
    backend: parseBackend(payload.backend),
  }
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1'
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1'
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=') || null
  }
  return null
}

export function createGuestSession(): Session {
  const suffix = randomBytes(4).toString('hex')
  return {
    gotrueId: `guest_${randomBytes(8).toString('hex')}`,
    email: '',
    projectRef: `draft_${suffix}`,
    orgSlug: 'guest',
    projectName: 'My business',
    studioUrl: '',
  }
}

export function isGuestSession(session: Session): boolean {
  return (
    !session.email ||
    session.gotrueId.startsWith('guest_') ||
    session.projectRef.startsWith('draft_') ||
    session.orgSlug === 'guest'
  )
}

export function claimsToSession(claims: StudioClaims): Session {
  const email = claims.email
  const local = email.includes('@') ? email.split('@')[0]?.trim() : ''
  return {
    gotrueId: claims.sub,
    email,
    projectRef: claims.project_ref,
    orgSlug: claims.organization_slug,
    projectName: claims.project_name,
    displayName: local || undefined,
    studioUrl: claims.studio_url || 'https://studio.indobase.in',
    backend: claims.backend,
  }
}

/** Human-readable name for CFOS profile / chat authorship. */
export function profileDisplayName(session: Pick<Session, 'displayName' | 'email'>): string {
  const named = typeof session.displayName === 'string' ? session.displayName.trim() : ''
  if (named) return named
  const email = typeof session.email === 'string' ? session.email.trim() : ''
  if (email.includes('@')) {
    const local = email.split('@')[0]?.trim()
    if (local) return local
  }
  return ''
}
