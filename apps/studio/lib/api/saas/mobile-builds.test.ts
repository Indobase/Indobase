import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  hasValidProjectMobileBuildRuntimeToken,
  isValidProjectMobileBuildTransition,
  resolveProjectMobileBuildOrgConcurrentLimit,
  resolveProjectMobileBuildOrgOutstandingLimit,
  resolveProjectMobileBuildPriorityForPlan,
  resolveProjectMobileBuildRuntimeSecret,
} from './mobile-builds'

describe('mobile builds', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows only forward mobile build state transitions', () => {
    expect(isValidProjectMobileBuildTransition('requested', 'building')).toBe(true)
    expect(isValidProjectMobileBuildTransition('building', 'ready')).toBe(true)
    expect(isValidProjectMobileBuildTransition('building', 'failed')).toBe(true)
    expect(isValidProjectMobileBuildTransition('ready', 'archived')).toBe(true)

    expect(isValidProjectMobileBuildTransition('ready', 'building')).toBe(false)
    expect(isValidProjectMobileBuildTransition('failed', 'requested')).toBe(false)
    expect(isValidProjectMobileBuildTransition('archived', 'ready')).toBe(false)
  })

  it('prefers a dedicated runtime secret for internal mobile build auth', () => {
    vi.stubEnv('PROJECT_MOBILE_BUILD_RUNTIME_SECRET', 'super-secret-mobile-build-token-with-at-least-32-characters')
    vi.stubEnv('BUILDER_HANDOFF_SECRET', 'super-secret-builder-token-with-at-least-32-characters')
    vi.stubEnv('AUTH_JWT_SECRET', '')
    vi.stubEnv('JWT_SECRET', '')

    expect(resolveProjectMobileBuildRuntimeSecret()).toBe(
      'super-secret-mobile-build-token-with-at-least-32-characters'
    )
    expect(
      hasValidProjectMobileBuildRuntimeToken({
        'x-indobase-mobile-build-token':
          'super-secret-mobile-build-token-with-at-least-32-characters',
      })
    ).toBe(true)
    expect(
      hasValidProjectMobileBuildRuntimeToken({
        'x-indobase-mobile-build-token': 'super-secret-builder-token-with-at-least-32-characters',
      })
    ).toBe(false)
  })

  it('falls back to the builder handoff secret when no mobile build runtime secret is configured', () => {
    vi.stubEnv('PROJECT_MOBILE_BUILD_RUNTIME_SECRET', '')
    vi.stubEnv('BUILDER_HANDOFF_SECRET', 'super-secret-builder-token-with-at-least-32-characters')
    vi.stubEnv('AUTH_JWT_SECRET', '')
    vi.stubEnv('JWT_SECRET', '')

    expect(resolveProjectMobileBuildRuntimeSecret()).toBe(
      'super-secret-builder-token-with-at-least-32-characters'
    )
    expect(
      hasValidProjectMobileBuildRuntimeToken({
        'x-indobase-mobile-build-token': 'super-secret-builder-token-with-at-least-32-characters',
      })
    ).toBe(true)
    expect(
      hasValidProjectMobileBuildRuntimeToken({
        'x-indobase-mobile-build-token': 'wrong-secret',
      })
    ).toBe(false)
  })

  it('uses tier-based queue priorities and concurrency defaults', () => {
    expect(resolveProjectMobileBuildPriorityForPlan('free')).toBe('standard')
    expect(resolveProjectMobileBuildPriorityForPlan('pro')).toBe('standard')
    expect(resolveProjectMobileBuildPriorityForPlan('team')).toBe('priority')
    expect(resolveProjectMobileBuildPriorityForPlan('enterprise')).toBe('priority')

    expect(resolveProjectMobileBuildOrgConcurrentLimit('free')).toBe(1)
    expect(resolveProjectMobileBuildOrgConcurrentLimit('pro')).toBe(3)
    expect(resolveProjectMobileBuildOrgConcurrentLimit('team')).toBe(10)

    expect(resolveProjectMobileBuildOrgOutstandingLimit('free')).toBe(3)
    expect(resolveProjectMobileBuildOrgOutstandingLimit('pro')).toBe(10)
    expect(resolveProjectMobileBuildOrgOutstandingLimit('team')).toBe(25)
  })

  it('allows env overrides for tier concurrency and priority', () => {
    vi.stubEnv('PROJECT_MOBILE_BUILD_TEAM_PRIORITY', 'standard')
    vi.stubEnv('PROJECT_MOBILE_BUILD_TEAM_MAX_CONCURRENT_PER_ORG', '7')
    vi.stubEnv('PROJECT_MOBILE_BUILD_TEAM_MAX_OUTSTANDING_PER_ORG', '19')

    expect(resolveProjectMobileBuildPriorityForPlan('team')).toBe('standard')
    expect(resolveProjectMobileBuildOrgConcurrentLimit('team')).toBe(7)
    expect(resolveProjectMobileBuildOrgOutstandingLimit('team')).toBe(19)
  })
})
