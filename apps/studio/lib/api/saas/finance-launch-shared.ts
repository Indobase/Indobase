/**
 * Client-safe Finance SSO helpers (no Node crypto / DB imports).
 * Server minting lives in `finance-launch.ts`.
 */

/** Same org roles as Email / Social / Payments — owner | admin | developer | viewer. */
export const FINANCE_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type FinanceRole = (typeof FINANCE_ALLOWED_ROLES)[number]

export const FINANCE_ROLE_DENIED_CODE = 'finance_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(FINANCE_ALLOWED_ROLES)

export function isFinanceRole(role: string | null | undefined): role is FinanceRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

export function isFinanceRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(FINANCE_ROLE_DENIED_CODE) ||
    (lower.includes('finance') && lower.includes('ask an organization'))
  )
}
