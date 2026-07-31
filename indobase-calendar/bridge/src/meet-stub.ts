/**
 * Phase 1 stub — Calendar ↔ Meet auto-attach.
 * Full room provisioning lives in indobase-meet; Calendar only surfaces a Meet URL field.
 */

export function defaultMeetLinkForProject(projectRef: string): string {
  const host = (process.env.MEET_PUBLIC_URL || 'https://meet.indobase.in').replace(/\/+$/, '')
  const ref = (projectRef || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'unknown'
  return `${host}/meeting/ib-meet-proj-${ref}`
}

export type MeetAttachStub = {
  enabled: boolean
  /** Suggested Meet room URL for new event types (operator may copy). */
  meetLink: string
  note: string
}

export function buildMeetAttachStub(projectRef: string): MeetAttachStub {
  const enabled = (process.env.CALENDAR_MEET_AUTO_ATTACH || '1').trim() !== '0'
  return {
    enabled,
    meetLink: defaultMeetLinkForProject(projectRef),
    note: 'Phase 1 stub — paste into event location. Live auto-attach ships with Meet Phase 2.',
  }
}
