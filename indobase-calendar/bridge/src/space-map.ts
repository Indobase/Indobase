/**
 * Org / project → Calendar space keys (must stay in sync with Studio calendar-launch-shared).
 */

export type CalendarSpaceMap = {
  orgSlug: string
  projectRef: string
  orgKey: string
  projectUsername: string
  teamTitle: string
  spaceTitle: string
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

/** Stable org team slug for Calendar team / org grouping. */
export function calendarOrgKey(orgSlug: string): string {
  return `ib-cal-org-${sanitizeKey(orgSlug, 40)}`
}

/** Stable public booking username per project. */
export function calendarProjectUsername(projectRef: string): string {
  return `ib-cal-${sanitizeKey(projectRef, 48)}`
}

export function buildCalendarSpaceMap(input: {
  orgSlug: string
  projectRef: string
  projectName?: string
  organizationName?: string
}): CalendarSpaceMap {
  const orgSlug = input.orgSlug || 'org'
  const projectRef = input.projectRef || 'project'
  return {
    orgSlug,
    projectRef,
    orgKey: calendarOrgKey(orgSlug),
    projectUsername: calendarProjectUsername(projectRef),
    teamTitle: (input.organizationName || orgSlug).slice(0, 64),
    spaceTitle: (input.projectName || projectRef).slice(0, 64),
  }
}

/** Default post-SSO landing (Indobase path alias → engine event types). */
export function calendarEventsPath(): string {
  return '/events'
}
