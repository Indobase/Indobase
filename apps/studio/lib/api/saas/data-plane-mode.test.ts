import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  normalizeDataPlaneMode,
  resolveDataPlaneModeForPlan,
  resolveSharedGatewayPublicApiUrl,
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
})
