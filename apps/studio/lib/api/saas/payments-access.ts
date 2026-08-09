import { getURL } from 'lib/helpers'

import {
  buildStudioPaymentsHubUrl,
  isPaymentsMerchantAdminRole,
  isPaymentsRole,
  type PaymentsMerchantAdminRole,
  type PaymentsRole,
} from './payments-access-shared'
import { executeQuery } from './query'

export {
  buildStudioPaymentsHubUrl,
  isPaymentsMerchantAdminRole,
  isPaymentsRole,
  isPaymentsRoleDeniedMessage,
  PAYMENTS_ALLOWED_ROLES,
  PAYMENTS_MERCHANT_ADMIN_ROLES,
  PAYMENTS_ROLE_DENIED_CODE,
  paymentsTenantSlugForOrg,
  sanitizePaymentsOrgSlug,
  type PaymentsMerchantAdminRole,
  type PaymentsRole,
} from './payments-access-shared'

/**
 * The caller's Payments-eligible role, or null if they are not an org member
 * with owner/admin/developer/viewer.
 */
export async function resolvePaymentsRole(
  gotrueId: string,
  organizationSlug: string
): Promise<PaymentsRole | null> {
  if (!gotrueId || !organizationSlug) return null
  const rows = await executeQuery<{ role: string }>({
    query: `
      select m.role
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer', 'viewer')
      limit 1
    `,
    parameters: [organizationSlug, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const role = rows.data?.[0]?.role
  return isPaymentsRole(role) ? role : null
}

export async function resolvePaymentsMerchantAdminRole(
  gotrueId: string,
  organizationSlug: string
): Promise<PaymentsMerchantAdminRole | null> {
  const role = await resolvePaymentsRole(gotrueId, organizationSlug)
  return isPaymentsMerchantAdminRole(role) ? role : null
}

export function getStudioOrigin(): string {
  return getURL() || 'https://studio.indobase.in'
}

/** Studio project Payments hub URL using the configured Studio origin. */
export function studioPaymentsHubUrl(projectRef: string): string {
  return buildStudioPaymentsHubUrl(projectRef, getStudioOrigin())
}
