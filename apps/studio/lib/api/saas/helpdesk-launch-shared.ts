/**
 * Client-safe Helpdesk SSO helpers (no Node crypto / DB imports).
 */

export const HELPDESK_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type HelpdeskRole = (typeof HELPDESK_ALLOWED_ROLES)[number]

export const HELPDESK_ROLE_DENIED_CODE = 'helpdesk_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(HELPDESK_ALLOWED_ROLES)

export function isHelpdeskRole(role: string | null | undefined): role is HelpdeskRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

/** Deterministic Helpdesk team key from org slug — mirrors bridge + Frappe helpdesk_map. */
export function helpdeskTeamKeyForOrgSlug(orgSlug: string): string {
  const cleaned = orgSlug
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9-]/.test(c))
    .join('')
    .slice(0, 64)
  if (!cleaned) return 'ib-hd-org-default'
  return `ib-hd-org-${cleaned}`.slice(0, 64)
}

/** Deterministic Helpdesk queue key from project ref. */
export function helpdeskQueueKeyForProjectRef(projectRef: string): string {
  const cleaned = projectRef
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 40)
  if (!cleaned) return 'ib-hd-proj-default'
  return `ib-hd-proj-${cleaned}`.slice(0, 64)
}

export function isHelpdeskRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(HELPDESK_ROLE_DENIED_CODE) ||
    lower.includes('organization owner or admin') ||
    (lower.includes('helpdesk') && lower.includes('ask an organization'))
  )
}
