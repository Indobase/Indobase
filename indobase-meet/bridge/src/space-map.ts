/**
 * Deterministic org/project → Meet org key / meeting id.
 *
 * Must stay in sync with `apps/studio/lib/api/saas/meet-launch-shared.ts`.
 */

export type MeetSpaceMap = {
  orgSlug: string
  projectRef: string
  orgKey: string
  meetingId: string
  orgTitle: string
  meetingTitle: string
}

const MAX_KEY_LEN = 64

function cleanSlug(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9-]/.test(c))
    .join('')
    .slice(0, MAX_KEY_LEN)
}

function cleanProjectRef(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 40)
}

/** Stable Meet org key for an Indobase organization slug. */
export function meetOrgKeyForOrgSlug(orgSlug: string): string {
  const cleaned = cleanSlug(orgSlug)
  if (!cleaned) return 'ib-meet-org-default'
  return `ib-meet-org-${cleaned}`.slice(0, MAX_KEY_LEN)
}

/** Stable default meeting id for an Indobase project ref (XMPP MUC-safe). */
export function meetMeetingIdForProjectRef(projectRef: string): string {
  const cleaned = cleanProjectRef(projectRef)
  if (!cleaned) return 'ib-meet-proj-default'
  return `ib-meet-proj-${cleaned}`.slice(0, MAX_KEY_LEN)
}

export function buildMeetSpaceMap(opts: {
  orgSlug: string
  projectRef: string
  projectName?: string
  organizationName?: string
}): MeetSpaceMap {
  const orgSlug = opts.orgSlug.trim()
  const projectRef = opts.projectRef.trim()
  const orgKey = meetOrgKeyForOrgSlug(orgSlug)
  const meetingId = meetMeetingIdForProjectRef(projectRef)
  const orgTitle = (opts.organizationName || orgSlug || 'Organization').slice(0, 64)
  const meetingTitle = (opts.projectName || projectRef || 'Project').slice(0, 64)

  return {
    orgSlug,
    projectRef,
    orgKey,
    meetingId,
    orgTitle,
    meetingTitle,
  }
}

/** Deep link after SSO — Indobase Meet meeting path. */
export function meetMeetingPath(map: MeetSpaceMap): string {
  return `/meeting/${encodeURIComponent(map.meetingId)}`
}
