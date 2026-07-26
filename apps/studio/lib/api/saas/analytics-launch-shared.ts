/**
 * Client-safe Analytics SSO helpers (no Node crypto / DB imports).
 * Server minting lives in `analytics-launch.ts`.
 */

/** Same org roles as Email / Social / Design / Video / Payments. */
export const ANALYTICS_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type AnalyticsRole = (typeof ANALYTICS_ALLOWED_ROLES)[number]

export const ANALYTICS_ROLE_DENIED_CODE = 'analytics_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(ANALYTICS_ALLOWED_ROLES)

export function isAnalyticsRole(role: string | null | undefined): role is AnalyticsRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

export function isAnalyticsRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(ANALYTICS_ROLE_DENIED_CODE) ||
    (lower.includes('analytics') && lower.includes('ask an organization'))
  )
}

/** Tag used inside Analytics sites.tags for project ↔ site mapping. */
export function analyticsProjectTag(projectRef: string) {
  return `ib-project:${projectRef}`
}

export function analyticsDefaultSiteDomain(projectRef: string, suffix = 'indobase.in') {
  return `${projectRef}.${suffix.replace(/^\./, '')}`
}
