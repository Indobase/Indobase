export const DOMAINS_ROLE_DENIED_CODE = 'domains_role_denied' as const

export const DOMAINS_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type DomainsRole = (typeof DOMAINS_ALLOWED_ROLES)[number]

export function isDomainsRole(role: string | null | undefined): role is DomainsRole {
  return !!role && (DOMAINS_ALLOWED_ROLES as readonly string[]).includes(role)
}

export function isDomainsRoleDeniedMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('grant you domains access') ||
    lower.includes('grant you domain access') ||
    lower.includes('organization owner or admin')
  )
}
