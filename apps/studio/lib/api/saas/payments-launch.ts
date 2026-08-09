import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getURL } from 'lib/helpers'

import { getProject, getGotrueUserId } from './platform'
import {
  isPaymentsMerchantAdminRole,
  isPaymentsRole,
  paymentsTenantSlugForOrg,
  type PaymentsMerchantAdminRole,
  type PaymentsRole,
} from './payments-launch-shared'
import { executeQuery } from './query'

export {
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
} from './payments-launch-shared'

type Claims = JwtPayload & Record<string, unknown>

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

/** Studio project Payments hub (BYOK) — not a separate Payments product host. */
export function buildStudioPaymentsHubUrl(projectRef: string, studioOrigin?: string): string {
  const origin = (studioOrigin || getStudioOrigin()).replace(/\/+$/, '')
  return `${origin}/project/${encodeURIComponent(projectRef)}/payments`
}

/**
 * Returns the Studio BYOK Payments hub URL for this project.
 * Legacy SSO to payments.indobase.in is retired — merchant checkout uses Razorpay/Stripe keys in Studio.
 */
export async function getPaymentsLaunchRedirect({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const project = await getProject({ claims, ref })
  if (!project) {
    throw new Error('Project not found')
  }

  const userId = getGotrueUserId(claims)
  const role = await resolvePaymentsRole(userId, project.organization_slug)
  if (!role) {
    throw new Error(
      'Ask an organization owner or admin to grant you Payments access (owner, admin, developer, or viewer).'
    )
  }

  const paymentsTenantSlug = paymentsTenantSlugForOrg(project.organization_slug)

  return {
    project,
    paymentsTenantSlug,
    role,
    url: buildStudioPaymentsHubUrl(project.ref),
  }
}
