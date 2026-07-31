/**
 * Calendar ↔ Meet room attach (Phase 2).
 *
 * Meeting ids are deterministic and match `indobase-meet` space-map /
 * Workspace meetings helpers. Rooms are linked by stable deep link + optional
 * SSO launch URL — media rooms materialize on first join.
 */

import { createHmac, createHash, randomBytes } from 'node:crypto'

import type { Session } from './auth.js'

const MAX_MEETING_ID_LEN = 64

export function meetPublicOrigin(): string {
  return (process.env.MEET_PUBLIC_URL || 'https://meet.indobase.in').replace(/\/+$/, '')
}

function cleanProjectRef(input: string): string {
  return (input || '')
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 40)
}

function cleanEventKey(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
}

/** Stable default meeting id for a project — mirrors Meet `meetMeetingIdForProjectRef`. */
export function meetMeetingIdForProjectRef(projectRef: string): string {
  const cleaned = cleanProjectRef(projectRef)
  if (!cleaned) return 'ib-meet-proj-default'
  return `ib-meet-proj-${cleaned}`.slice(0, MAX_MEETING_ID_LEN)
}

/**
 * Event-scoped room id. Prefer a short stable slug; fall back to a hash of the
 * raw event key so operators can pass engine event-type ids safely.
 */
export function meetMeetingIdForEvent(projectRef: string, eventKey: string): string {
  const proj = cleanProjectRef(projectRef) || 'default'
  const cleaned = cleanEventKey(eventKey)
  const suffix =
    cleaned ||
    createHash('sha256')
      .update(eventKey || 'event')
      .digest('hex')
      .slice(0, 12)
  return `ib-meet-evt-${proj}-${suffix}`.slice(0, MAX_MEETING_ID_LEN)
}

export function meetInviteUrl(meetingId: string): string {
  return `${meetPublicOrigin()}/meeting/${encodeURIComponent(meetingId)}`
}

/** @deprecated Prefer meetInviteUrl(meetMeetingIdForProjectRef(...)). */
export function defaultMeetLinkForProject(projectRef: string): string {
  return meetInviteUrl(meetMeetingIdForProjectRef(projectRef))
}

export function meetHandoffSecret(): string | null {
  const secret = (
    process.env.MEET_HANDOFF_SECRET ||
    process.env.STUDIO_HANDOFF_SECRET ||
    process.env.CALENDAR_HANDOFF_SECRET ||
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

export function mintMeetHandoffToken(session: Session, meetingId?: string): string | null {
  const secret = meetHandoffSecret()
  if (!secret) return null
  const now = Math.floor(Date.now() / 1000)
  const payload: Record<string, unknown> = {
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
  if (meetingId) payload.meeting_id = meetingId
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64urlEncode(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest()
  return `${header}.${body}.${b64urlEncode(sig)}`
}

export function mintMeetLaunchUrl(session: Session, meetingId: string): string | null {
  const token = mintMeetHandoffToken(session, meetingId)
  const origin = meetPublicOrigin()
  if (!token || !origin) return null
  const url = new URL(`${origin}/sso/launch`)
  url.searchParams.set('project_ref', session.projectRef)
  url.searchParams.set('from', 'calendar')
  url.searchParams.set('meeting', meetingId)
  url.hash = new URLSearchParams({ token }).toString()
  return url.toString()
}

export type MeetAttach = {
  enabled: boolean
  /** Stable room id (XMPP MUC-safe). */
  meetingId: string
  /** Public deep link guests can open (SSO required for branded join). */
  meetLink: string
  /** Alias of meetLink for Workspace/Meet parity. */
  inviteUrl: string
  /** Same-tab SSO launch when MEET_HANDOFF_SECRET is shared with Meet. */
  launchUrl: string | null
  mode: 'linked' | 'disabled'
  scope: 'project' | 'event'
  note: string
}

export type MeetAttachOpts = {
  projectRef: string
  eventKey?: string | null
  session?: Session | null
}

export function buildMeetAttach(opts: MeetAttachOpts): MeetAttach {
  const enabled = (process.env.CALENDAR_MEET_AUTO_ATTACH || '1').trim() !== '0'
  const eventKey = (opts.eventKey || '').trim()
  const meetingId = eventKey
    ? meetMeetingIdForEvent(opts.projectRef, eventKey)
    : meetMeetingIdForProjectRef(opts.projectRef)
  const meetLink = meetInviteUrl(meetingId)
  const launchUrl =
    enabled && opts.session ? mintMeetLaunchUrl(opts.session, meetingId) : null

  return {
    enabled,
    meetingId,
    meetLink,
    inviteUrl: meetLink,
    launchUrl,
    mode: enabled ? 'linked' : 'disabled',
    scope: eventKey ? 'event' : 'project',
    note: enabled
      ? launchUrl
        ? 'Meet room linked — open via SSO or paste the invite into event location.'
        : 'Meet room linked — paste invite into event location (share MEET_HANDOFF_SECRET for one-click open).'
      : 'Meet auto-attach disabled (CALENDAR_MEET_AUTO_ATTACH=0).',
  }
}

/** @deprecated Use buildMeetAttach — kept for older imports/tests. */
export type MeetAttachStub = MeetAttach

/** @deprecated Use buildMeetAttach. */
export function buildMeetAttachStub(projectRef: string): MeetAttach {
  return buildMeetAttach({ projectRef })
}

/**
 * Best-effort notify Meet `POST /api/rooms/link` with a short handoff token.
 * Failures are swallowed — Calendar SSO must not block on Meet being down.
 */
export async function notifyMeetRoomLinked(
  attach: MeetAttach,
  session: Session
): Promise<{ notified: boolean }> {
  if (!attach.enabled) return { notified: false }
  const token = mintMeetHandoffToken(session, attach.meetingId)
  if (!token) return { notified: false }
  const origin = meetPublicOrigin()
  try {
    const res = await fetch(`${origin}/api/rooms/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        meetingId: attach.meetingId,
        source: 'calendar',
        scope: attach.scope,
        inviteUrl: attach.inviteUrl,
      }),
      signal: AbortSignal.timeout(4000),
    })
    return { notified: res.ok }
  } catch {
    return { notified: false }
  }
}
