/**
 * Studio org role → Indobase Meet product role.
 */

export type StudioOrgRole = 'owner' | 'admin' | 'developer' | 'viewer'

/** Customer-facing Meet roles (never expose engine role names). */
export type MeetProductRole = 'Admin' | 'Moderator' | 'Participant' | 'Viewer'

export type MeetRoleMap = {
  meetRole: MeetProductRole
  isModerator: boolean
}

const ROLE_MAP: Record<StudioOrgRole, MeetRoleMap> = {
  owner: { meetRole: 'Admin', isModerator: true },
  admin: { meetRole: 'Moderator', isModerator: true },
  developer: { meetRole: 'Participant', isModerator: false },
  viewer: { meetRole: 'Viewer', isModerator: false },
}

export function meetRoleFromStudio(role: StudioOrgRole): MeetRoleMap {
  return ROLE_MAP[role]
}
