import { describe, expect, it } from 'vitest'

import {
  FREE_BUILDER_PROMPT_LIMIT,
  isBuilderPromptQuotaDisabled,
  isFreeBuilderOrgPlan,
  normalizeOrgPlanId,
} from './builder-prompt-quota'

describe('builder-prompt-quota', () => {
  it('treats only free as Builder-prompt-capped; Basic+ is unlimited', () => {
    expect(isFreeBuilderOrgPlan('free')).toBe(true)
    expect(isFreeBuilderOrgPlan('basic')).toBe(false)
    expect(isFreeBuilderOrgPlan('pro')).toBe(false)
    expect(isFreeBuilderOrgPlan('studio')).toBe(false)
    expect(isFreeBuilderOrgPlan('team')).toBe(false)
    expect(isFreeBuilderOrgPlan('enterprise')).toBe(false)
    expect(isFreeBuilderOrgPlan('platform')).toBe(false)
  })

  it('normalizes tier_* plan ids', () => {
    expect(normalizeOrgPlanId('tier_free')).toBe('free')
    expect(normalizeOrgPlanId('tier_basic')).toBe('basic')
    expect(normalizeOrgPlanId('tier_pro')).toBe('pro')
    expect(normalizeOrgPlanId('tier_studio')).toBe('studio')
  })

  it('exposes a five-prompt free cap', () => {
    expect(FREE_BUILDER_PROMPT_LIMIT).toBe(5)
  })

  it('can disable quota enforcement via env', () => {
    const previousQuota = process.env.INDOBASE_BUILDER_PROMPT_QUOTA_DISABLED
    const previousGates = process.env.INDOBASE_PLAN_GATES_ENABLED
    const previousPublicGates = process.env.NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED
    // Force plan gates on so this test isolates the quota-specific env flag.
    process.env.INDOBASE_PLAN_GATES_ENABLED = 'true'
    process.env.NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED = 'true'
    process.env.INDOBASE_BUILDER_PROMPT_QUOTA_DISABLED = 'true'
    expect(isBuilderPromptQuotaDisabled()).toBe(true)
    process.env.INDOBASE_BUILDER_PROMPT_QUOTA_DISABLED = previousQuota
    process.env.INDOBASE_PLAN_GATES_ENABLED = previousGates
    process.env.NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED = previousPublicGates
  })

  it('disables Builder prompt quota when plan gates are bypassed', () => {
    const previousQuota = process.env.INDOBASE_BUILDER_PROMPT_QUOTA_DISABLED
    const previousGates = process.env.INDOBASE_PLAN_GATES_ENABLED
    const previousPublicGates = process.env.NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED
    delete process.env.INDOBASE_BUILDER_PROMPT_QUOTA_DISABLED
    process.env.INDOBASE_PLAN_GATES_ENABLED = 'false'
    process.env.NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED = 'false'
    expect(isBuilderPromptQuotaDisabled()).toBe(true)
    process.env.INDOBASE_BUILDER_PROMPT_QUOTA_DISABLED = previousQuota
    process.env.INDOBASE_PLAN_GATES_ENABLED = previousGates
    process.env.NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED = previousPublicGates
  })
})
