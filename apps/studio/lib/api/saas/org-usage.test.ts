import { describe, expect, it } from 'vitest'

import { isOrgUsageMeteringAvailable } from 'lib/usage/metering'

describe('isOrgUsageMeteringAvailable', () => {
  it('returns false when metering flag is false', () => {
    expect(
      isOrgUsageMeteringAvailable({
        usage_billing_enabled: false,
        metering_available: false,
        usages: [],
      })
    ).toBe(false)
  })

  it('returns false when metering flag is true but usages are empty', () => {
    expect(
      isOrgUsageMeteringAvailable({
        usage_billing_enabled: true,
        metering_available: true,
        usages: [],
      })
    ).toBe(false)
  })

  it('returns true when metering has usage rows', () => {
    expect(
      isOrgUsageMeteringAvailable({
        usage_billing_enabled: true,
        metering_available: true,
        usages: [
          {
            metric: 'EGRESS',
            available_in_plan: true,
            capped: false,
            cost: 0,
            pricing_strategy: 'NONE',
            unlimited: true,
            usage: 1,
            usage_original: 1,
            unit_price_desc: 'GB',
            project_allocations: [],
          },
        ],
      })
    ).toBe(true)
  })
})
