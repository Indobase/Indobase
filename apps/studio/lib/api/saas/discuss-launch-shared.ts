/**
 * Client-safe Discuss SSO helpers (no Node crypto / DB imports).
 */

export const DISCUSS_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type DiscussRole = (typeof DISCUSS_ALLOWED_ROLES)[number]

export const DISCUSS_ROLE_DENIED_CODE = 'discuss_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(DISCUSS_ALLOWED_ROLES)

export function isDiscussRole(role: string | null | undefined): role is DiscussRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

/** Deterministic Discuss team key from org slug — mirrors bridge space-map (GP Team key). */
export function discussTeamKeyForOrgSlug(orgSlug: string): string {
  const cleaned = orgSlug
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9-]/.test(c))
    .join('')
    .slice(0, 64)
  if (!cleaned) return 'ib-org-default'
  return `ib-org-${cleaned}`.slice(0, 64)
}

/** Deterministic Discuss space key from project ref (GP Project key). */
export function discussSpaceKeyForProjectRef(projectRef: string): string {
  const cleaned = projectRef
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 40)
  if (!cleaned) return 'ib-proj-default'
  return `ib-proj-${cleaned}`.slice(0, 64)
}

export function isDiscussRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(DISCUSS_ROLE_DENIED_CODE) ||
    lower.includes('organization owner or admin') ||
    (lower.includes('discuss') && lower.includes('ask an organization'))
  )
}
