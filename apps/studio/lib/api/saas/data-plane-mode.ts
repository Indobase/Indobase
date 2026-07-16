import type { PlanId } from 'data/subscriptions/types'

export type DataPlaneMode = 'isolated_stack' | 'shared_gateway' | 'model_a'

const VALID_MODES = new Set<DataPlaneMode>(['isolated_stack', 'shared_gateway', 'model_a'])

export function normalizeDataPlaneMode(raw: string | null | undefined): DataPlaneMode {
  const value = (raw ?? '').trim() as DataPlaneMode
  if (VALID_MODES.has(value)) return value
  return 'isolated_stack'
}

/**
 * Frontend-only tiers (Free / Basic) use the shared API gateway.
 * Pro+ get isolated per-tenant stacks (backend Studio unlocked).
 */
export function resolveDataPlaneModeForPlan(planId: PlanId | string | null | undefined): DataPlaneMode {
  const plan = (planId ?? 'free').trim().toLowerCase()
  if (plan === 'free' || plan === 'basic' || plan === 'platform') {
    const override = process.env.SAAS_FREE_TIER_DATA_PLANE_MODE?.trim()
    if (override && VALID_MODES.has(override as DataPlaneMode)) {
      return override as DataPlaneMode
    }
    return 'shared_gateway'
  }
  // Model A is opt-in only — never select it from plan alone without the allow flag.
  if (
    process.env.SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE === 'false' &&
    isSharedDatabaseTenancyExplicitlyAllowed()
  ) {
    return 'model_a'
  }
  return 'isolated_stack'
}

/** Default: every new project gets a dedicated database (safe). */
export function isDedicatedDatabaseOnProjectCreateEnabled(): boolean {
  return process.env.SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE !== 'false'
}

export function usesSharedGatewayDataPlane(mode: DataPlaneMode): boolean {
  return mode === 'shared_gateway'
}

/**
 * `model_a` = every project shares ONE Postgres database, isolated only by RLS. GoTrue `auth.users`,
 * Storage, and any table without a `project_ref` + RLS policy are visible across tenants. Note this
 * is orthogonal to `shared_gateway` (a routing choice) — a shared-gateway project can still have its
 * own dedicated `tenantdb_<ref>` and be fully isolated.
 */
export function usesSharedDatabaseTenancy(mode: DataPlaneMode): boolean {
  return mode === 'model_a'
}

/** Operators must explicitly accept cross-tenant exposure to run the shared-database (Model A) model. */
export function isSharedDatabaseTenancyExplicitlyAllowed(): boolean {
  return process.env.SAAS_ALLOW_SHARED_DATABASE_TENANCY === 'true'
}

/**
 * When true, Studio may use the control-plane Postgres URI for a tenant project that has no
 * dedicated connection string. Default false — that fallback is the cross-tenant auth/storage leak.
 */
export function isSharedControlPlaneDatabaseFallbackAllowed(): boolean {
  return isSharedDatabaseTenancyExplicitlyAllowed()
}

/**
 * Fail closed before creating a project on a shared database. Dedicated-DB creation (the default)
 * is always allowed; the shared-database path is refused unless the operator has explicitly opted in,
 * because it leaks auth users and non-RLS tables across tenants.
 */
export function assertProjectDatabaseIsolationAllowed(opts: { dedicatedOnCreate: boolean }): void {
  if (opts.dedicatedOnCreate) return
  if (isSharedDatabaseTenancyExplicitlyAllowed()) return
  throw new Error(
    'Refusing to create a project on a SHARED database (Model A): auth.users, storage objects, and ' +
      'any table without a project_ref + RLS policy are visible across ALL tenants. Configure ' +
      'per-project databases (SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE=true with POSTGRES_HOST and ' +
      'POSTGRES_PASSWORD). Shared-database tenancy is unsupported for untrusted tenants; only if you ' +
      'fully understand the exposure, set BOTH SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE=false and ' +
      'SAAS_ALLOW_SHARED_DATABASE_TENANCY=true.'
  )
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
