/**
 * Client-safe Payments access helpers (no Node crypto / DB imports).
 * Role checks for Studio BYOK Payments hub + merchant KYC.
 */

/**
 * Org roles allowed to open the Studio Payments hub (BYOK).
 * Matches saas.organization_members.role: owner | admin | developer | viewer.
 * Merchant KYC / gateway key edits stay owner/admin-only (see merchant-kyc).
 */
export const PAYMENTS_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type PaymentsRole = (typeof PAYMENTS_ALLOWED_ROLES)[number]

/** Owner/admin only — merchant KYC / money-movement onboarding. */
export const PAYMENTS_MERCHANT_ADMIN_ROLES = ['owner', 'admin'] as const
export type PaymentsMerchantAdminRole = (typeof PAYMENTS_MERCHANT_ADMIN_ROLES)[number]

export const PAYMENTS_ROLE_DENIED_CODE = 'payments_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(PAYMENTS_ALLOWED_ROLES)
const MERCHANT_ADMIN_ROLE_SET = new Set<string>(PAYMENTS_MERCHANT_ADMIN_ROLES)

export function isPaymentsRole(role: string | null | undefined): role is PaymentsRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

export function isPaymentsMerchantAdminRole(
  role: string | null | undefined
): role is PaymentsMerchantAdminRole {
  return !!role && MERCHANT_ADMIN_ROLE_SET.has(role)
}

/**
 * Stable merchant tenant slug derived from Studio org slug (`ib-{sanitized}`).
 * Kept for saas merchant profile rows; no longer maps to a separate Payments product org.
 */
export function sanitizePaymentsOrgSlug(raw: string): string {
  const cleaned = raw
    .split('')
    .map((c) => (/[a-zA-Z0-9]/.test(c) ? c.toLowerCase() : '-'))
    .join('')
  const trimmed = cleaned.replace(/^-+|-+$/g, '')
  const body = trimmed.length === 0 ? 'org' : trimmed.slice(0, 40)
  return `ib-${body}`
}

export function paymentsTenantSlugForOrg(organizationSlug: string): string {
  return sanitizePaymentsOrgSlug(organizationSlug)
}

export function isPaymentsRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes('owners and admins only') ||
    lower.includes('organization owner or admin') ||
    lower.includes(PAYMENTS_ROLE_DENIED_CODE) ||
    lower.includes('ask an organization owner or admin') ||
    (lower.includes('payments') && lower.includes('available to organization'))
  )
}
