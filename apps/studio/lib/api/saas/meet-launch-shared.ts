/**
 * Client-safe Meet SSO helpers (no Node crypto / DB imports).
 * Must stay in sync with `indobase-meet/bridge/src/space-map.ts` + `roles.ts`.
 */

export const MEET_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type MeetStudioRole = (typeof MEET_ALLOWED_ROLES)[number]

export const MEET_ROLE_DENIED_CODE = 'meet_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(MEET_ALLOWED_ROLES)

export function isMeetStudioRole(role: string | null | undefined): role is MeetStudioRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

/** Deterministic Meet org key from org slug — mirrors bridge space-map. */
export function meetOrgKeyForOrgSlug(orgSlug: string): string {
  const cleaned = orgSlug
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9-]/.test(c))
    .join('')
    .slice(0, 64)
  if (!cleaned) return 'ib-meet-org-default'
  return `ib-meet-org-${cleaned}`.slice(0, 64)
}

/** Deterministic default meeting id from project ref. */
export function meetMeetingIdForProjectRef(projectRef: string): string {
  const cleaned = projectRef
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 40)
  if (!cleaned) return 'ib-meet-proj-default'
  return `ib-meet-proj-${cleaned}`.slice(0, 64)
}

export type MeetProductRole = 'Admin' | 'Moderator' | 'Participant' | 'Viewer'

export function meetRoleFromStudio(role: MeetStudioRole): {
  meetRole: MeetProductRole
  isModerator: boolean
} {
  switch (role) {
    case 'owner':
      return { meetRole: 'Admin', isModerator: true }
    case 'admin':
      return { meetRole: 'Moderator', isModerator: true }
    case 'developer':
      return { meetRole: 'Participant', isModerator: false }
    case 'viewer':
      return { meetRole: 'Viewer', isModerator: false }
  }
}

export function isMeetRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(MEET_ROLE_DENIED_CODE) ||
    lower.includes('organization owner or admin') ||
    (lower.includes('meet') && lower.includes('ask an organization'))
  )
}
