/**
 * Indobase Workspace → Indobase Calendar launch helpers.
 *
 * Workspace Calendar no longer embeds a raw scheduling iframe. It mints an
 * aud=indobase-calendar handoff (when CALENDAR_HANDOFF_SECRET is set) and
 * deep-links to calendar host /sso/launch then /events. Customer chrome never
 * names the upstream engine.
 */

import { createHmac, randomBytes } from 'node:crypto'

import type { Session } from './auth.js'

export const CALENDAR_PRODUCT_NAME = 'Indobase Calendar'

/** Stable public booking username per project (alphanumeric + hyphen). */
export function calendarProjectUsername(projectRef: string): string {
  const ref =
    (projectRef || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'unknown'
  return `ib-cal-${ref}`
}

/** Public Calendar host (no scheme), e.g. calendar.indobase.in */
export function calendarPublicHost(): string | null {
  const raw = (process.env.CALENDAR_PUBLIC_URL || '').trim().replace(/\/+$/, '')
  if (!raw) return null
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return u.host || null
  } catch {
    return null
  }
}

export function calendarPublicOrigin(): string | null {
  const host = calendarPublicHost()
  if (!host) return null
  const raw = (process.env.CALENDAR_PUBLIC_URL || '').trim()
  try {
    const u = new URL(raw.includes('://') ? raw.replace(/\/+$/, '') : `https://${host}`)
    return u.origin
  } catch {
    return `https://${host}`
  }
}

export function isCalendarConfigured(): boolean {
  return !!calendarPublicOrigin() && !!calendarHandoffSecret()
}

export function calendarHandoffSecret(): string | null {
  const secret = (
    process.env.CALENDAR_HANDOFF_SECRET ||
    process.env.STUDIO_HANDOFF_SECRET ||
    ''
  ).trim()
  return secret.length >= 32 ? secret : null
}

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function mintCalendarHandoffToken(session: Session, secret: string): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: session.gotrueId,
    email: session.email,
    project_ref: session.projectRef,
    organization_slug: session.orgSlug,
    organization_name: session.organizationName || session.orgSlug,
    project_name: session.projectName || session.projectRef,
    role: session.role,
    studio_url: session.studioUrl,
    aud: 'indobase-calendar',
    iss: session.studioUrl,
    iat: now,
    exp: now + 60 * 5,
    jti: randomBytes(8).toString('hex'),
  }
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64urlEncode(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest()
  return `${header}.${body}.${b64urlEncode(sig)}`
}

/** Origins allowed in CSP frame-src (legacy; Workspace no longer iframes Calendar). */
export function calendarFrameOrigins(): string[] {
  const origins = new Set<string>()
  const primary = calendarPublicOrigin()
  if (primary) origins.add(primary)
  for (const fallback of ['https://calendar.indobase.in', 'https://calendar.indobase.fun']) {
    origins.add(fallback)
  }
  return [...origins]
}

export type CalendarLaunchConfig = {
  ready: boolean
  productName: string
  sessionAttached: true
  email: string
  projectRef: string
  username: string
  origin: string | null
  /** Full SSO launch URL (fragment token) — open Indobase Calendar */
  launchUrl: string | null
  /** Public booking page for the project calendar user */
  bookingUrl: string | null
  openUrl: string | null
  manageUrl: string | null
  mode: 'sso' | 'unconfigured'
  /** @deprecated iframe path removed */
  embedUrl: string | null
}

/** @deprecated Prefer CalendarLaunchConfig */
export type CalendarEmbedConfig = CalendarLaunchConfig

export function buildCalendarEmbedConfig(session: Session): CalendarLaunchConfig {
  const origin = calendarPublicOrigin()
  const username = calendarProjectUsername(session.projectRef)
  const bookingUrl = origin ? `${origin}/${encodeURIComponent(username)}` : null
  const openUrl = origin ? `${origin}/events` : null
  const manageUrl = origin ? `${origin}/settings` : null

  const secret = calendarHandoffSecret()
  let launchUrl: string | null = null
  if (origin && secret) {
    const token = mintCalendarHandoffToken(session, secret)
    const url = new URL(`${origin}/sso/launch`)
    url.searchParams.set('project_ref', session.projectRef)
    url.searchParams.set('from', 'workspace')
    url.hash = new URLSearchParams({ token }).toString()
    launchUrl = url.toString()
  }

  return {
    ready: !!launchUrl,
    productName: CALENDAR_PRODUCT_NAME,
    sessionAttached: true,
    email: session.email,
    projectRef: session.projectRef,
    username,
    origin,
    launchUrl,
    bookingUrl,
    openUrl,
    manageUrl,
    mode: launchUrl ? 'sso' : 'unconfigured',
    embedUrl: null,
  }
}
