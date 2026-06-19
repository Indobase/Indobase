import type { PlanId } from 'data/subscriptions/types'

export type DataPlaneMode = 'isolated_stack' | 'shared_gateway' | 'model_a'

const VALID_MODES = new Set<DataPlaneMode>(['isolated_stack', 'shared_gateway', 'model_a'])

export function normalizeDataPlaneMode(raw: string | null | undefined): DataPlaneMode {
  const value = (raw ?? '').trim() as DataPlaneMode
  if (VALID_MODES.has(value)) return value
  return 'isolated_stack'
}

/**
 * Free (Starter) orgs use shared Postgres DB per project + slim sidecars behind the shared gateway.
 * Paid tiers keep isolated per-tenant stacks on ref.<domain>.
 */
export function resolveDataPlaneModeForPlan(planId: PlanId | string | null | undefined): DataPlaneMode {
  const plan = (planId ?? 'free').trim().toLowerCase()
  if (plan === 'free' || plan === 'platform') {
    const override = process.env.SAAS_FREE_TIER_DATA_PLANE_MODE?.trim()
    if (override && VALID_MODES.has(override as DataPlaneMode)) {
      return override as DataPlaneMode
    }
    return 'shared_gateway'
  }
  if (process.env.SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE === 'false') {
    return 'model_a'
  }
  return 'isolated_stack'
}

export function usesSharedGatewayDataPlane(mode: DataPlaneMode): boolean {
  return mode === 'shared_gateway'
}

export function usesIsolatedTenantStack(mode: DataPlaneMode): boolean {
  return mode === 'isolated_stack'
}

export function resolveSharedGatewayPublicApiUrl(): string {
  const raw = (
    process.env.SAAS_SHARED_GATEWAY_PUBLIC_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim()
  if (!raw) return 'http://127.0.0.1:8000'
  return raw.replace(/\/$/, '')
}
