/**
 * Studio org role → Indobase Calendar product role.
 */

export type StudioOrgRole = 'owner' | 'admin' | 'developer' | 'viewer'

/** Customer-facing Calendar roles (never expose engine role names). */
export type CalendarProductRole = 'Owner' | 'Admin' | 'Member' | 'Readonly'

export type CalendarRoleMap = {
  calendarRole: CalendarProductRole
  canManage: boolean
  canEdit: boolean
}

const ROLE_MAP: Record<StudioOrgRole, CalendarRoleMap> = {
  owner: { calendarRole: 'Owner', canManage: true, canEdit: true },
  admin: { calendarRole: 'Admin', canManage: true, canEdit: true },
  developer: { calendarRole: 'Member', canManage: false, canEdit: true },
  viewer: { calendarRole: 'Readonly', canManage: false, canEdit: false },
}

export function calendarRoleFromStudio(role: StudioOrgRole): CalendarRoleMap {
  return ROLE_MAP[role]
}
