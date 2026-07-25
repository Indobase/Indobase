/**
 * Client-safe Social SSO helpers (no Node crypto / DB imports).
 * Server minting lives in `social-launch.ts`.
 */

/** Same org roles as Email / Payments — owner | admin | developer | viewer. */
export const SOCIAL_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type SocialRole = (typeof SOCIAL_ALLOWED_ROLES)[number]

export const SOCIAL_ROLE_DENIED_CODE = 'social_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(SOCIAL_ALLOWED_ROLES)

export function isSocialRole(role: string | null | undefined): role is SocialRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

/** Deterministic Indobase Social org name from project ref. */
export function socialOrgNameForProjectRef(projectRef: string): string {
  const cleaned = projectRef
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9-]/.test(c))
    .join('')
  if (!cleaned) return 'ib:workspace'
  return `ib:${cleaned.slice(0, 48)}`
}

export function isSocialRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(SOCIAL_ROLE_DENIED_CODE) ||
    lower.includes('organization owner or admin') ||
    (lower.includes('social') && lower.includes('ask an organization'))
  )
}
