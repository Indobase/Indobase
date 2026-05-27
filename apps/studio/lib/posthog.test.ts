import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as common from 'common'
import { trackFeatureFlag } from './posthog'

vi.mock('common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('common')>()
  return {
    ...actual,
    hasConsented: vi.fn(),
    isPostHogConfigured: vi.fn(),
    posthogClient: {
      captureFeatureFlagCall: vi.fn(),
    },
    trackFeatureFlag: vi.fn(),
  }
})

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
