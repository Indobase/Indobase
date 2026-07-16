import { useParams } from 'common'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { getPlanEntitlements } from 'lib/api/saas/plan-entitlements'
import { IS_SAAS } from 'lib/constants'

/**
 * Free & Basic cannot open backend Studio. Pro+ can.
 * Returns loading=true until org plan is known on project routes.
 */
export function useBackendStudioAccess() {
  const { ref } = useParams()
  const enabled = IS_SAAS && Boolean(ref)
  const { data: organization, isPending, isSuccess } = useSelectedOrganizationQuery({
    enabled,
  })

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
    isLoading,
    // While loading, deny access so Free users never briefly see Studio chrome.
    hasAccess: isLoading ? false : entitlements.backendStudio,
    organization,
    planId,
    planName: entitlements.displayName,
    billingHref: organization?.slug
      ? `/org/${organization.slug}/billing?panel=subscriptionPlan`
      : '/organizations',
  }
}
