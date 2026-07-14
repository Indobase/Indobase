import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  assertProjectDatabaseIsolationAllowed,
  isDedicatedDatabaseOnProjectCreateEnabled,
  isSharedControlPlaneDatabaseFallbackAllowed,
  normalizeDataPlaneMode,
  resolveDataPlaneModeForPlan,
  resolveSharedGatewayPublicApiUrl,
  usesSharedDatabaseTenancy,
  usesSharedGatewayDataPlane,
} from './data-plane-mode'

describe('data-plane-mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('normalizeDataPlaneMode falls back to isolated_stack', () => {
    expect(normalizeDataPlaneMode('')).toBe('isolated_stack')
    expect(normalizeDataPlaneMode('shared_gateway')).toBe('shared_gateway')
  })

  it('resolveDataPlaneModeForPlan maps free to shared_gateway', () => {
    expect(resolveDataPlaneModeForPlan('free')).toBe('shared_gateway')
    expect(resolveDataPlaneModeForPlan('platform')).toBe('shared_gateway')
  })

  it('resolveDataPlaneModeForPlan maps paid tiers to isolated_stack', () => {
    vi.stubEnv('SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE', 'true')
    expect(resolveDataPlaneModeForPlan('pro')).toBe('isolated_stack')
    expect(resolveDataPlaneModeForPlan('team')).toBe('isolated_stack')
  })

  it('does not select model_a from dedicated=false alone (fail closed)', () => {
    vi.stubEnv('SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE', 'false')
    expect(resolveDataPlaneModeForPlan('pro')).toBe('isolated_stack')
  })

  it('selects model_a only when dedicated=false AND shared tenancy is explicitly allowed', () => {
    vi.stubEnv('SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE', 'false')
    vi.stubEnv('SAAS_ALLOW_SHARED_DATABASE_TENANCY', 'true')
    expect(resolveDataPlaneModeForPlan('pro')).toBe('model_a')
  })

  it('honors SAAS_FREE_TIER_DATA_PLANE_MODE override', () => {
    vi.stubEnv('SAAS_FREE_TIER_DATA_PLANE_MODE', 'isolated_stack')
    expect(resolveDataPlaneModeForPlan('free')).toBe('isolated_stack')
  })

  it('resolveSharedGatewayPublicApiUrl strips trailing slash', () => {
    vi.stubEnv('SAAS_SHARED_GATEWAY_PUBLIC_URL', 'https://api.example.com/')
    expect(resolveSharedGatewayPublicApiUrl()).toBe('https://api.example.com')
  })

  it('usesSharedGatewayDataPlane identifies shared gateway mode', () => {
    expect(usesSharedGatewayDataPlane('shared_gateway')).toBe(true)
    expect(usesSharedGatewayDataPlane('isolated_stack')).toBe(false)
  })

  it('usesSharedDatabaseTenancy flags only model_a (not shared_gateway)', () => {
    expect(usesSharedDatabaseTenancy('model_a')).toBe(true)
    expect(usesSharedDatabaseTenancy('shared_gateway')).toBe(false)
    expect(usesSharedDatabaseTenancy('isolated_stack')).toBe(false)
  })

  it('dedicated-on-create defaults to enabled', () => {
    expect(isDedicatedDatabaseOnProjectCreateEnabled()).toBe(true)
  })

  it('shared control-plane DB fallback is refuse-by-default', () => {
    expect(isSharedControlPlaneDatabaseFallbackAllowed()).toBe(false)
    vi.stubEnv('SAAS_ALLOW_SHARED_DATABASE_TENANCY', 'true')
    expect(isSharedControlPlaneDatabaseFallbackAllowed()).toBe(true)
  })

  it('assertProjectDatabaseIsolationAllowed permits the dedicated-DB default', () => {
    expect(() => assertProjectDatabaseIsolationAllowed({ dedicatedOnCreate: true })).not.toThrow()
  })

  it('assertProjectDatabaseIsolationAllowed fails closed on shared DB without opt-in', () => {
    expect(() => assertProjectDatabaseIsolationAllowed({ dedicatedOnCreate: false })).toThrow(
      /SHARED database/
    )
  })

  it('assertProjectDatabaseIsolationAllowed allows shared DB only with explicit opt-in', () => {
    vi.stubEnv('SAAS_ALLOW_SHARED_DATABASE_TENANCY', 'true')
    expect(() => assertProjectDatabaseIsolationAllowed({ dedicatedOnCreate: false })).not.toThrow()
  })
})
