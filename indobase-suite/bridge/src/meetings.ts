/**
 * Indobase Workspace → Indobase Meet launch helpers.
 *
 * Workspace Meetings no longer embeds a raw engine iframe. It mints an
 * aud=indobase-meet handoff (when MEET_HANDOFF_SECRET is set) and deep-links
 * to meet host /meeting/{id}. Customer chrome never names the media engine.
 */

import { createHmac, randomBytes } from 'node:crypto'

import type { Session } from './auth.js'

export const MEET_PRODUCT_NAME = 'Indobase Meet'

/** Stable meeting id per project — mirrors `indobase-meet/bridge/src/space-map.ts`. */
export function meetingsRoomName(projectRef: string): string {
  const cleaned = (projectRef || '')
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 40)
  if (!cleaned) return 'ib-meet-proj-default'
  return `ib-meet-proj-${cleaned}`.slice(0, 64)
}

/** @deprecated Use meetingsRoomName — kept for older tests/callers. */
export function legacyWorkspaceMeetingsRoomName(projectRef: string): string {
  const ref =
    (projectRef || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'unknown'
  return `ib-ws-proj-${ref}`
}

export function displayNameFromEmail(email: string): string {
  const local = (email || '').split('@')[0]?.trim()
  if (!local) return 'Guest'
  return local
    .replace(/[._+-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 80)
}

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Public Meet host origin, e.g. https://meet.indobase.in */
export function meetPublicOrigin(): string | null {
  const raw = (
    process.env.MEET_PUBLIC_URL ||
    process.env.MEETINGS_PUBLIC_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '')
  if (!raw) return null
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return u.origin
  } catch {
    return null
  }
}

export function meetingsPublicHost(): string | null {
  const origin = meetPublicOrigin()
  if (!origin) return null
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}

export function meetingsPublicOrigin(): string | null {
  return meetPublicOrigin()
}

export function isMeetingsConfigured(): boolean {
  return !!meetPublicOrigin()
}

export function meetHandoffSecret(): string | null {
  const secret = (
    process.env.MEET_HANDOFF_SECRET ||
    process.env.STUDIO_HANDOFF_SECRET ||
    ''
  ).trim()
  return secret.length >= 32 ? secret : null
}

export function meetingsJwtConfigured(): boolean {
  // Prefer Meet handoff (SSO). Engine JWT alone is not enough for Workspace launch.
  return !!meetHandoffSecret()
}

function mintMeetHandoffToken(session: Session, secret: string): string {
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
    aud: 'indobase-meet',
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

export type MeetingsLaunchConfig = {
  ready: boolean
  productName: string
  meetingId: string
  displayName: string
  email: string
  /** Full SSO launch URL (fragment token) — open in same or new tab */
  launchUrl: string | null
  inviteUrl: string | null
  brandLogoUrl: string
  mode: 'sso' | 'unconfigured'
}

export function buildMeetingsLaunchConfig(session: Session): MeetingsLaunchConfig {
  const origin = meetPublicOrigin()
  const meetingId = meetingsRoomName(session.projectRef)
  const displayName = displayNameFromEmail(session.email)
  const workspaceOrigin = (process.env.WORKSPACE_PUBLIC_URL || 'https://workspace.indobase.in').replace(
    /\/+$/,
    ''
  )
  const brandLogoUrl = `${workspaceOrigin}/brand/indobase-logo-wordmark.svg`
  const inviteUrl = origin ? `${origin}/meeting/${encodeURIComponent(meetingId)}` : null

  const secret = meetHandoffSecret()
  let launchUrl: string | null = null
  if (origin && secret) {
    const token = mintMeetHandoffToken(session, secret)
    const url = new URL(`${origin}/sso/launch`)
    url.searchParams.set('project_ref', session.projectRef)
    url.searchParams.set('from', 'workspace')
    url.hash = new URLSearchParams({ token }).toString()
    launchUrl = url.toString()
  }

  return {
    ready: !!launchUrl,
    productName: MEET_PRODUCT_NAME,
    meetingId,
    displayName,
    email: session.email,
    launchUrl,
    inviteUrl,
    brandLogoUrl,
    mode: launchUrl ? 'sso' : 'unconfigured',
  }
}

/** @deprecated Prefer buildMeetingsLaunchConfig — iframe embed path removed in Phase 1. */
export type MeetingsEmbedConfig = MeetingsLaunchConfig & {
  domain: string | null
  roomName: string
  jwt: string | null
  jwtRequired: boolean
  externalApiUrl: string | null
  configOverwrite: Record<string, unknown>
  interfaceConfigOverwrite: Record<string, unknown>
}

export function buildMeetingsEmbedConfig(session: Session): MeetingsEmbedConfig {
  const launch = buildMeetingsLaunchConfig(session)
  const domain = meetingsPublicHost()
  return {
    ...launch,
    domain,
    roomName: launch.meetingId,
    jwt: null,
    jwtRequired: false,
    externalApiUrl: null,
    configOverwrite: {},
    interfaceConfigOverwrite: {
      APP_NAME: MEET_PRODUCT_NAME,
      SHOW_JITSI_WATERMARK: false,
      SHOW_POWERED_BY: false,
    },
  }
}

/** Origins allowed for Permissions-Policy when Meet is framed (Workspace no longer frames engine). */
export function meetingsPermissionOrigins(): string[] {
  const origins = new Set<string>()
  const primary = meetPublicOrigin()
  if (primary) origins.add(primary)
  for (const fallback of ['https://meet.indobase.in', 'https://meet.indobase.fun']) {
    origins.add(fallback)
  }
  return [...origins]
}
