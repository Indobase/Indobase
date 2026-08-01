/**
 * Scheduling engine client — auto-provision + NextAuth session exchange.
 * Never expose upstream product names in user-facing errors.
 */
import { createHmac } from 'node:crypto'

import type { StudioClaims } from './auth.js'
import type { CalendarSpaceMap } from './space-map.js'
import { calendarEventsPath } from './space-map.js'
import { calendarRoleFromStudio } from './roles.js'
import { markCalendarUserVerified } from './verify-user.js'

export type EngineSession = {
  cookies: string[]
  redirect: string
  username: string
}

function resolveBaseUrl(): string {
  return (process.env.CALENDAR_APP_URL || process.env.CALENDAR_INTERNAL_URL || '').replace(/\/+$/, '')
}

export function isCalendarEngineConfigured(): boolean {
  return Boolean(resolveBaseUrl())
}

export async function calendarEnginePing(): Promise<boolean> {
  const base = resolveBaseUrl()
  if (!base) return false
  try {
    const res = await fetch(`${base}/api/health`, { method: 'GET', redirect: 'manual' })
    if (res.ok) return true
    // Some builds expose /api/auth/providers instead
    const auth = await fetch(`${base}/api/auth/providers`, { method: 'GET', redirect: 'manual' })
    return auth.ok
  } catch {
    return false
  }
}

/** Deterministic password so SSO can mint a browser session via credentials. */
export function derivedPassword(claims: StudioClaims, handoffSecret: string): string {
  return createHmac('sha256', handoffSecret)
    .update(`calendar-engine:${claims.sub}:${claims.email.toLowerCase()}`)
    .digest('base64url')
    .slice(0, 48)
}

function usernameFromClaims(claims: StudioClaims, map: CalendarSpaceMap): string {
  // Prefer stable project booking handle for org owners; otherwise per-user slug.
  const mapped = calendarRoleFromStudio(claims.role)
  if (mapped.canManage) return map.projectUsername
  const base = `ib${claims.sub.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`.slice(0, 28)
  return base.length >= 3 ? base : map.projectUsername
}

function collectSetCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie()
  }
  const single = res.headers.get('set-cookie')
  return single ? [single] : []
}

async function fetchCsrf(base: string): Promise<{ token: string; cookies: string[] }> {
  const res = await fetch(`${base}/api/auth/csrf`, { method: 'GET', redirect: 'manual' })
  const cookies = collectSetCookies(res)
  let token = ''
  try {
    const body = (await res.json()) as { csrfToken?: string }
    token = body.csrfToken || ''
  } catch {
    token = ''
  }
  return { token, cookies }
}

function cookieHeader(cookies: string[]): string {
  return cookies
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ')
}

async function trySignup(
  base: string,
  email: string,
  password: string,
  username: string
): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        username,
      }),
      redirect: 'manual',
    })
    // 201 created, 200 ok, 409/422 already exists — all fine to proceed to login
    return res.status < 500
  } catch (err) {
    console.error('[calendar] signup attempt failed:', err)
    return false
  }
}

async function credentialsLogin(
  base: string,
  email: string,
  password: string,
  csrf: { token: string; cookies: string[] }
): Promise<string[]> {
  const body = new URLSearchParams()
  body.set('csrfToken', csrf.token)
  body.set('email', email)
  body.set('password', password)
  body.set('callbackUrl', `${base}/`)
  body.set('json', 'true')

  const res = await fetch(`${base}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(csrf.cookies),
    },
    body,
    redirect: 'manual',
  })

  const cookies = [...csrf.cookies, ...collectSetCookies(res)]
  if (res.status >= 400 && res.status !== 302) {
    console.error('[calendar] credentials login failed', res.status)
    throw new Error('Could not open Calendar session')
  }
  return cookies
}

/**
 * Ensure user exists in the scheduling engine and mint browser session cookies.
 * Role mapping is recorded on the bridge session; engine CE may not enforce all roles.
 */
export async function exchangeStudioClaimsForCalendar(
  claims: StudioClaims,
  map: CalendarSpaceMap,
  handoffSecret: string
): Promise<EngineSession> {
  const base = resolveBaseUrl()
  if (!base) throw new Error('Calendar engine not configured')

  const password = derivedPassword(claims, handoffSecret)
  const username = usernameFromClaims(claims, map)

  await trySignup(base, claims.email, password, username)

  /*
   * Propagate Studio's email verification. trySignup goes through the engine's public signup path,
   * which leaves emailVerified null and parks the user on a "Check your email" screen that never
   * clears — no verification mail is sent for SSO users. Studio already verified this address.
   *
   * Runs before login so the session is established against an already-verified row. Awaited but
   * non-fatal: a nag screen is recoverable, a thrown launch is not.
   */
  await markCalendarUserVerified(claims.email)

  const csrf = await fetchCsrf(base)
  if (!csrf.token) {
    throw new Error('Could not prepare Calendar session')
  }

  const cookies = await credentialsLogin(base, claims.email, password, csrf)

  // Rewrite cookie attributes for the public calendar host (Path=/; Secure; SameSite=Lax)
  const rewritten = cookies.map((raw) => {
    const parts = raw.split(';').map((p) => p.trim())
    const nv = parts[0]
    if (!nv) return raw
    return `${nv}; Path=/; HttpOnly; Secure; SameSite=Lax`
  })

  return {
    cookies: rewritten,
    redirect: calendarEventsPath(),
    username,
  }
}

/** Forward Set-Cookie lines for the engine session onto the bridge response. */
export function engineSessionCookies(session: EngineSession): string[] {
  return session.cookies
}
