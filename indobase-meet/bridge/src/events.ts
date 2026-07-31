/**
 * Phase 1 event bus stub — accept envelopes, no-op persist/dispatch.
 * Phase 2+ wires Calendar, Discuss, Files, AI, Analytics, notifications, search, automation.
 */

export type MeetEventEnvelope = {
  type: string
  meetingId?: string
  projectRef?: string
  orgSlug?: string
  payload?: Record<string, unknown>
  ts?: number
}

export function acceptMeetEvent(body: unknown): { ok: true; accepted: true; deferred: true } {
  // Validate lightly so bad clients get 400 from the route; storage is intentionally a no-op.
  void body
  return { ok: true, accepted: true, deferred: true }
}

export function isMeetEventEnvelope(body: unknown): body is MeetEventEnvelope {
  if (!body || typeof body !== 'object') return false
  const t = (body as MeetEventEnvelope).type
  return typeof t === 'string' && t.trim().length > 0
}
