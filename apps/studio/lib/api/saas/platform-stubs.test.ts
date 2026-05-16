import { describe, expect, it } from 'vitest'

import {
  defaultFeatureFlagsResponse,
  defaultResourceWarningsResponse,
  getSaasStudioConfigCatFlagValues,
} from './platform-stubs'

describe('platform-stubs', () => {
  it('enables unified logs and branching flags for SaaS', () => {
    const flags = defaultFeatureFlagsResponse()
    expect(flags.unifiedLogs).toBe(true)
    expect(flags.gitlessBranching).toBe(true)
    expect(flags.allowDataBranching).toBe(true)
    expect(flags.newHomepageUsageV2).toBe(false)
  })

  it('returns empty resource warnings', () => {
    expect(defaultResourceWarningsResponse()).toEqual([])
  })

  it('exports ConfigCat-shaped defaults', () => {
    const values = getSaasStudioConfigCatFlagValues()
    expect(values.some((v) => v.settingKey === 'unifiedLogs' && v.settingValue === true)).toBe(true)
  })
})
