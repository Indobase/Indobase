/**
 * Shared Calendar launch helpers (safe for client + server).
 * Keep keys in sync with `indobase-calendar/bridge/src/space-map.ts`.
 */

export const CALENDAR_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type CalendarRole = (typeof CALENDAR_ALLOWED_ROLES)[number]

export const CALENDAR_ROLE_DENIED_CODE = 'CALENDAR_ROLE_DENIED'

const ALLOWED = new Set<string>(CALENDAR_ALLOWED_ROLES)

export function isCalendarRole(role: string | null | undefined): role is CalendarRole {
  return !!role && ALLOWED.has(role)
}

export function isCalendarRoleDeniedMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('calendar') &&
    (lower.includes('ask an organization') || lower.includes('grant you'))
  )
}

function sanitizeKey(raw: string, max = 48): string {
  return (
    (raw || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, max) || 'unknown'
  )
}

export function calendarOrgKeyForOrgSlug(orgSlug: string): string {
  return `ib-cal-org-${sanitizeKey(orgSlug, 40)}`
}

export function calendarProjectUsernameForRef(projectRef: string): string {
  return `ib-cal-${sanitizeKey(projectRef, 48)}`
}

/** Studio org role → Calendar product role (customer-facing). */
export function calendarProductRoleFromStudio(role: CalendarRole): string {
  switch (role) {
    case 'owner':
      return 'Owner'
    case 'admin':
      return 'Admin'
    case 'developer':
      return 'Member'
    case 'viewer':
      return 'Readonly'
  }
}
