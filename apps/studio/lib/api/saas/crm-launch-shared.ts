/**
 * Client-safe CRM SSO helpers (no Node crypto / DB imports).
 */

export const CRM_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type CrmRole = (typeof CRM_ALLOWED_ROLES)[number]

export const CRM_ROLE_DENIED_CODE = 'crm_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(CRM_ALLOWED_ROLES)

export function isCrmRole(role: string | null | undefined): role is CrmRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

/** Deterministic CRM team key from org slug — mirrors bridge crm_map. */
export function crmTeamKeyForOrgSlug(orgSlug: string): string {
  const cleaned = orgSlug
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9-]/.test(c))
    .join('')
    .slice(0, 64)
  if (!cleaned) return 'ib-crm-org-default'
  return `ib-crm-org-${cleaned}`.slice(0, 64)
}

/** Deterministic CRM pipeline key from project ref. */
export function crmPipelineKeyForProjectRef(projectRef: string): string {
  const cleaned = projectRef
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 40)
  if (!cleaned) return 'ib-crm-proj-default'
  return `ib-crm-proj-${cleaned}`.slice(0, 64)
}

export function isCrmRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(CRM_ROLE_DENIED_CODE) ||
    lower.includes('organization owner or admin') ||
    (lower.includes('crm') && lower.includes('ask an organization'))
  )
}
