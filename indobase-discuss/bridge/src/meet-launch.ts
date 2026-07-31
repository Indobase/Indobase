/**
 * Discuss → Indobase Meet launch helpers (Phase 2B Start call).
 *
 * Mints aud=indobase-meet handoff tokens from the Discuss session and builds
 * channel- or project-scoped room ids. Customer chrome says "Start call" / Meet.
 */

import { createHmac, randomBytes } from 'node:crypto'

import type { Session } from './auth.js'

export const MEET_PRODUCT_NAME = 'Indobase Meet'
const MAX_MEETING_ID_LEN = 64

function cleanProjectRef(input: string): string {
  return (input || '')
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 40)
}

function cleanChannelPart(input: string): string {
  return (input || '')
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 16)
}

/** Stable project meeting id — mirrors Meet / Calendar / Workspace. */
export function meetMeetingIdForProjectRef(projectRef: string): string {
  const cleaned = cleanProjectRef(projectRef)
  if (!cleaned) return 'ib-meet-proj-default'
  return `ib-meet-proj-${cleaned}`.slice(0, MAX_MEETING_ID_LEN)
}

/** Channel-scoped room so Start call opens a space for this Discuss channel. */
export function meetMeetingIdForChannel(projectRef: string, channelId: string): string {
  const proj = cleanProjectRef(projectRef) || 'default'
  const ch = cleanChannelPart(channelId)
  if (!ch) return meetMeetingIdForProjectRef(projectRef)
  return `ib-meet-ch-${proj}-${ch}`.slice(0, MAX_MEETING_ID_LEN)
}

export function meetPublicOrigin(): string {
  return (process.env.MEET_PUBLIC_URL || 'https://meet.indobase.in').replace(/\/+$/, '')
}

export function meetHandoffSecret(): string | null {
  const secret = (
    process.env.MEET_HANDOFF_SECRET ||
    process.env.STUDIO_HANDOFF_SECRET ||
    process.env.DISCUSS_HANDOFF_SECRET ||
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

export function mintMeetHandoffToken(session: Session, meetingId: string): string | null {
  const secret = meetHandoffSecret()
  if (!secret) return null
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
    meeting_id: meetingId,
  }
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64urlEncode(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest()
  return `${header}.${body}.${b64urlEncode(sig)}`
}

export type MeetStartCall = {
  ready: boolean
  productName: string
  meetingId: string
  inviteUrl: string
  launchUrl: string | null
  scope: 'project' | 'channel'
  note: string
}

export function buildMeetStartCall(
  session: Session,
  opts?: { channelId?: string | null }
): MeetStartCall {
  const channelId = (opts?.channelId || '').trim()
  const meetingId = channelId
    ? meetMeetingIdForChannel(session.projectRef, channelId)
    : meetMeetingIdForProjectRef(session.projectRef)
  const origin = meetPublicOrigin()
  const inviteUrl = `${origin}/meeting/${encodeURIComponent(meetingId)}`
  const token = mintMeetHandoffToken(session, meetingId)
  let launchUrl: string | null = null
  if (token) {
    const url = new URL(`${origin}/sso/launch`)
    url.searchParams.set('project_ref', session.projectRef)
    url.searchParams.set('from', 'discuss')
    url.searchParams.set('meeting', meetingId)
    url.hash = new URLSearchParams({ token }).toString()
    launchUrl = url.toString()
  }
  return {
    ready: !!launchUrl,
    productName: MEET_PRODUCT_NAME,
    meetingId,
    inviteUrl,
    launchUrl,
    scope: channelId ? 'channel' : 'project',
    note: launchUrl
      ? 'Start call opens Indobase Meet for this channel/project.'
      : 'Meet handoff secret not configured on Discuss bridge.',
  }
}

/** Best-effort notify Meet room registry (non-blocking). */
export async function notifyMeetCallStarted(
  call: MeetStartCall,
  session: Session
): Promise<{ notified: boolean }> {
  if (!call.ready) return { notified: false }
  const token = mintMeetHandoffToken(session, call.meetingId)
  if (!token) return { notified: false }
  try {
    const res = await fetch(`${meetPublicOrigin()}/api/rooms/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        meetingId: call.meetingId,
        source: 'discuss',
        scope: call.scope,
        inviteUrl: call.inviteUrl,
      }),
      signal: AbortSignal.timeout(4000),
    })
    return { notified: res.ok }
  } catch {
    return { notified: false }
  }
}
