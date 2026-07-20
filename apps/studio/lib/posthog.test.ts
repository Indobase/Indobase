import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as common from 'common'
import { trackFeatureFlag } from './posthog'
import { capturePostHogException } from './posthog-server'

vi.mock('common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('common')>()
  return {
    ...actual,
    hasConsented: vi.fn(),
    isPostHogConfigured: vi.fn(),
    posthogClient: {
      captureFeatureFlagCall: vi.fn(),
      captureException: vi.fn(),
    },
    trackFeatureFlag: vi.fn(),
  }
})

const captureExceptionMock = vi.fn()
const flushMock = vi.fn().mockResolvedValue(undefined)

vi.mock('posthog-node', () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    captureException: captureExceptionMock,
    flush: flushMock,
  })),
}))

describe('trackFeatureFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns undefined if user has not consented', async () => {
    vi.spyOn(common, 'hasConsented').mockReturnValue(false)
    const result = await trackFeatureFlag({
      feature_flag_name: 'test',
      feature_flag_value: true,
    })
    expect(result).toBeUndefined()
    expect(common.posthogClient.captureFeatureFlagCall).not.toHaveBeenCalled()
  })

  it('captures via PostHog client when configured and consented', async () => {
    vi.spyOn(common, 'hasConsented').mockReturnValue(true)
    vi.spyOn(common, 'isPostHogConfigured').mockReturnValue(true)

    const result = await trackFeatureFlag({
      feature_flag_name: 'homeNew',
      feature_flag_value: 'new-home',
    })

    expect(result).toBeUndefined()
    expect(common.posthogClient.captureFeatureFlagCall).toHaveBeenCalledWith(
      'homeNew',
      'new-home',
      true
    )
  })
})

describe('capturePostHogException', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test')
  })

  it('no-ops when PostHog is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    vi.resetModules()
    const { capturePostHogException: capture } = await import('./posthog-server')

    await capture('user-1', new Error('fail'))

    expect(captureExceptionMock).not.toHaveBeenCalled()
  })

  it('captures server exceptions when configured', async () => {
    vi.resetModules()
    const { capturePostHogException: capture } = await import('./posthog-server')
    const error = new Error('platform failure')

    await capture('user-1', error, { route: '/api/platform/test' })

    expect(captureExceptionMock).toHaveBeenCalledWith(error, 'user-1', {
      route: '/api/platform/test',
    })
    expect(flushMock).toHaveBeenCalled()
  })
})
