import { useParams } from 'common'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { getPlanEntitlements } from 'lib/api/saas/plan-entitlements'
import { arePlanGatesBypassed } from 'lib/api/saas/plan-gates'
import { IS_SAAS } from 'lib/constants'

/**
 * Free cannot open backend Studio when plan gates are on. Basic+ can (see plan-entitlements).
 * When plan gates are bypassed, every signed-in org is treated as allowed.
 * Returns loading=true until org plan is known on project routes.
 */
export function useBackendStudioAccess() {
  const { ref } = useParams()
  const enabled = IS_SAAS && Boolean(ref)
  const { data: organization, isPending, isSuccess } = useSelectedOrganizationQuery({
    enabled,
  })
  const gatesBypassed = arePlanGatesBypassed()

  if (!enabled) {
    return {
      enabled: false,
      isLoading: false,
      hasAccess: true,
      organization,
      planId: organization?.plan?.id ?? 'free',
      planName: organization?.plan?.name ?? 'Free',
      billingHref: '/organizations',
    }
  }

  const planId = organization?.plan?.id ?? 'free'
  const entitlements = getPlanEntitlements(planId)
  const isLoading = isPending && !isSuccess

  return {
    enabled: true,
    isLoading: gatesBypassed ? false : isLoading,
    // While loading with gates on, deny so Free users never briefly see Studio chrome.
    hasAccess: gatesBypassed ? true : isLoading ? false : entitlements.backendStudio,
    organization,
    planId,
    planName: entitlements.displayName,
    billingHref: organization?.slug
      ? `/org/${organization.slug}/billing?panel=subscriptionPlan`
      : '/organizations',
  }
}
