/**
 * Client-safe Email SSO helpers (no Node crypto / DB imports).
 * Server minting lives in `email-launch.ts`.
 */

/** Same org roles as Payments — owner | admin | developer | viewer. */
export const EMAIL_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type EmailRole = (typeof EMAIL_ALLOWED_ROLES)[number]

export const EMAIL_ROLE_DENIED_CODE = 'email_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(EMAIL_ALLOWED_ROLES)

export function isEmailRole(role: string | null | undefined): role is EmailRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

/** Deterministic Notifuse workspace id from project ref (alphanumeric, max 20).
 *  Must match Email `WorkspaceIDForProjectRef` — DB column is VARCHAR(20). */
export function emailWorkspaceIdForProjectRef(projectRef: string): string {
  const cleaned = projectRef
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
  if (!cleaned) return 'workspace'
  return cleaned.slice(0, 20)
}

export function isEmailRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(EMAIL_ROLE_DENIED_CODE) ||
    lower.includes('organization owner or admin') ||
    (lower.includes('email') && lower.includes('ask an organization'))
  )
}
