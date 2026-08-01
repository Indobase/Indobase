/**
 * Meet room link registry + event bus.
 *
 * Phase 1 accepted envelopes as no-ops. Phase 2 acknowledges Calendar/Discuss
 * room links in-memory (enough for health/debug; durable store is later).
 */

export type MeetEventEnvelope = {
  type: string
  meetingId?: string
  projectRef?: string
  orgSlug?: string
  payload?: Record<string, unknown>
  ts?: number
}

export type LinkedRoom = {
  meetingId: string
  projectRef?: string
  orgSlug?: string
  source: string
  scope?: string
  inviteUrl?: string
  linkedAt: number
}

const linkedRooms = new Map<string, LinkedRoom>()

export function acceptMeetEvent(body: unknown): {
  ok: true
  accepted: true
  deferred: boolean
  meetingId?: string
} {
  void body
  return { ok: true, accepted: true, deferred: true }
}

export function isMeetEventEnvelope(body: unknown): body is MeetEventEnvelope {
  if (!body || typeof body !== 'object') return false
  const t = (body as MeetEventEnvelope).type
  return typeof t === 'string' && t.trim().length > 0
}

export function linkMeetRoom(input: {
  meetingId: string
  projectRef?: string
  orgSlug?: string
  source: string
  scope?: string
  inviteUrl?: string
}): LinkedRoom {
  const meetingId = input.meetingId.trim().slice(0, 64)
  const row: LinkedRoom = {
    meetingId,
    projectRef: input.projectRef,
    orgSlug: input.orgSlug,
    source: input.source,
    scope: input.scope,
    inviteUrl: input.inviteUrl,
    linkedAt: Date.now(),
  }
  linkedRooms.set(meetingId, row)
  return row
}

export function getLinkedRoom(meetingId: string): LinkedRoom | null {
  return linkedRooms.get(meetingId) || null
}

export function acceptRoomLinkEvent(envelope: MeetEventEnvelope): {
  ok: true
  accepted: true
  deferred: false
  room: LinkedRoom
} {
  const meetingId = (envelope.meetingId || '').trim()
  if (!meetingId) {
    throw new Error('meetingId required')
  }
  const room = linkMeetRoom({
    meetingId,
    projectRef: envelope.projectRef,
    orgSlug: envelope.orgSlug,
    source: String(envelope.payload?.source || envelope.type || 'event'),
    scope: typeof envelope.payload?.scope === 'string' ? envelope.payload.scope : undefined,
    inviteUrl: typeof envelope.payload?.inviteUrl === 'string' ? envelope.payload.inviteUrl : undefined,
  })
  return { ok: true, accepted: true, deferred: false, room }
}
