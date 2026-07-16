import { describe, expect, it } from 'vitest'

import { isOrgUsageMeteringAvailable } from 'lib/usage/metering'
import { assembleOrgUsage, buildOrgUsageRow } from './org-usage'
import { getIndobasePublicPlans } from './indobase-billing-plans'

const GIB = 1024 * 1024 * 1024
const freePlan = getIndobasePublicPlans().find((p) => p.id === 'free')

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

describe('buildOrgUsageRow', () => {
  it('renders a byte metric as GB and marks it capped when the plan defines a limit', () => {
    const row = buildOrgUsageRow(
      {
        metric: 'DATABASE_SIZE',
        totalBase: 2 * GIB,
        projects: [
          { ref: 'a', name: 'A', base: 1.5 * GIB },
          { ref: 'b', name: 'B', base: 0.5 * GIB },
          { ref: 'c', name: 'C', base: 0 },
        ],
      },
      freePlan
    )
    expect(row.metric).toBe('DATABASE_SIZE')
    expect(row.usage).toBeCloseTo(2)
    expect(row.unit_price_desc).toBe('GB')
    expect(row.unlimited).toBe(false) // free plan has database_size limit
    // zero-usage projects are omitted from allocations
    expect(row.project_allocations.map((p) => p.ref)).toEqual(['a', 'b'])
    expect(row.project_allocations[0].usage).toBeCloseTo(1.5)
  })

  it('treats EGRESS as unlimited (no plan-limit key) and keeps raw counts for count metrics', () => {
    const egress = buildOrgUsageRow({ metric: 'EGRESS', totalBase: GIB, projects: [] }, freePlan)
    expect(egress.unlimited).toBe(true)

    const mau = buildOrgUsageRow(
      {
        metric: 'MONTHLY_ACTIVE_USERS',
        totalBase: 1200,
        projects: [{ ref: 'a', name: 'A', base: 1200 }],
      },
      freePlan
    )
    expect(mau.usage).toBe(1200) // not divided by GiB
    expect(mau.unit_price_desc).toBe('MAU')
    expect(mau.unlimited).toBe(false) // free plan has auth_maus limit
  })
})

describe('assembleOrgUsage', () => {
  it('emits egress + function invocations from events and size/MAU from daily snapshots', () => {
    const res = assembleOrgUsage({
      usageBillingEnabled: true,
      plan: freePlan,
      eventsAvailable: true,
      events: [{ ref: 'a', name: 'A', bytes: GIB, fnInvocations: 42 }],
      dailyLatest: [
        { ref: 'a', name: 'A', metric: 'DATABASE_SIZE', value: GIB },
        { ref: 'a', name: 'A', metric: 'STORAGE_SIZE', value: 2 * GIB },
        { ref: 'a', name: 'A', metric: 'MONTHLY_ACTIVE_USERS', value: 500 },
      ],
    })
    expect(res.metering_available).toBe(true)
    const metrics = res.usages.map((u) => u.metric)
    expect(metrics).toEqual([
      'EGRESS',
      'FUNCTION_INVOCATIONS',
      'DATABASE_SIZE',
      'STORAGE_SIZE',
      'MONTHLY_ACTIVE_USERS',
    ])
    expect(res.usages.find((u) => u.metric === 'FUNCTION_INVOCATIONS')?.usage).toBe(42)
    expect(res.usages.find((u) => u.metric === 'STORAGE_SIZE')?.usage).toBeCloseTo(2)
  })

  it('is metering_unavailable with no events and no daily snapshots', () => {
    const res = assembleOrgUsage({
      usageBillingEnabled: false,
      plan: freePlan,
      eventsAvailable: false,
      events: [],
      dailyLatest: [],
    })
    expect(res.metering_available).toBe(false)
    expect(res.usages).toEqual([])
  })

  it('omits daily metric rows that have no snapshots but still emits event rows', () => {
    const res = assembleOrgUsage({
      usageBillingEnabled: true,
      plan: freePlan,
      eventsAvailable: true,
      events: [{ ref: 'a', name: 'A', bytes: 0, fnInvocations: 0 }],
      dailyLatest: [],
    })
    expect(res.usages.map((u) => u.metric)).toEqual(['EGRESS', 'FUNCTION_INVOCATIONS'])
    expect(res.metering_available).toBe(true)
  })
})
