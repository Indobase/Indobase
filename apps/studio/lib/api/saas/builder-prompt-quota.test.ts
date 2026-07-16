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
    const previous = process.env.INDOBASE_BUILDER_PROMPT_QUOTA_DISABLED
    process.env.INDOBASE_BUILDER_PROMPT_QUOTA_DISABLED = 'true'
    expect(isBuilderPromptQuotaDisabled()).toBe(true)
    process.env.INDOBASE_BUILDER_PROMPT_QUOTA_DISABLED = previous
  })
})
