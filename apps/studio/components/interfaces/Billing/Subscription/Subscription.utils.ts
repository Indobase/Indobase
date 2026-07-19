import type { OrgSubscription, PlanId, ProjectSelectedAddon } from 'data/subscriptions/types'
import { getPlanChangeType as getEntitlementsPlanChangeType } from 'lib/api/saas/plan-entitlements'
import { IS_SAAS } from 'lib/constants'

export const getAddons = (selectedAddons: ProjectSelectedAddon[]) => {
  const computeInstance = selectedAddons.find((addon) => addon.type === 'compute_instance')
  const pitr = selectedAddons.find((addon) => addon.type === 'pitr')
  const customDomain = selectedAddons.find((addon) => addon.type === 'custom_domain')
  const ipv4 = selectedAddons.find((addon) => addon.type === 'ipv4')

  return { computeInstance, pitr, customDomain, ipv4 }
}

export const subscriptionHasHipaaAddon = (subscription?: OrgSubscription): boolean => {
  if (!IS_SAAS) return false

  return (subscription?.addons ?? []).some(
    (addon) => addon.supabase_prod_id === 'addon_security_hipaa'
  )
}

export const billingPartnerLabel = (billingPartner?: string) => {
  if (!billingPartner) return billingPartner

  switch (billingPartner) {
    case 'fly':
      return 'Fly.io'
    case 'aws':
      return 'AWS'
    case 'vercel_marketplace':
      return 'Vercel'
    default:
      return billingPartner
  }
}

type PlanChangeType = 'upgrade' | 'downgrade' | 'none'

/**
 * Rank-based so every PlanId (including basic/studio and legacy team) is handled —
 * unknown plans rank as free rather than crashing or mis-reporting.
 */
export const getPlanChangeType = (
  fromPlan: PlanId | undefined,
  toPlan: PlanId | undefined
): PlanChangeType => {
  if (!fromPlan || !toPlan) {
    return 'none'
  }

  return getEntitlementsPlanChangeType(fromPlan, toPlan)
}
