import { describe, expect, it } from 'vitest'

import {
  FREE_BUILDER_PROMPT_LIMIT,
  isFreeBuilderOrgPlan,
  normalizeOrgPlanId,
} from './builder-prompt-quota'

describe('builder-prompt-quota', () => {
  it('treats only pro/team/enterprise as paid Builder plans', () => {
    expect(isFreeBuilderOrgPlan('free')).toBe(true)
    expect(isFreeBuilderOrgPlan('pro')).toBe(false)
    expect(isFreeBuilderOrgPlan('team')).toBe(false)
    expect(isFreeBuilderOrgPlan('enterprise')).toBe(false)
    expect(isFreeBuilderOrgPlan('platform')).toBe(false)
  })

  it('normalizes tier_* plan ids', () => {
    expect(normalizeOrgPlanId('tier_free')).toBe('free')
    expect(normalizeOrgPlanId('tier_pro')).toBe('pro')
  })

  it('exposes a five-prompt free cap', () => {
    expect(FREE_BUILDER_PROMPT_LIMIT).toBe(5)
  })
})
