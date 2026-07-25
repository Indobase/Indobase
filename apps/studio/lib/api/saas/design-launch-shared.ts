/**
 * Client-safe Design SSO helpers (no Node crypto / DB imports).
 * Server minting lives in `design-launch.ts`.
 */

/** Same org roles as Email / Social / Payments — owner | admin | developer | viewer. */
export const DESIGN_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type DesignRole = (typeof DESIGN_ALLOWED_ROLES)[number]

export const DESIGN_ROLE_DENIED_CODE = 'design_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(DESIGN_ALLOWED_ROLES)

export function isDesignRole(role: string | null | undefined): role is DesignRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

export function isDesignRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(DESIGN_ROLE_DENIED_CODE) ||
    (lower.includes('design') && lower.includes('ask an organization'))
  )
}
