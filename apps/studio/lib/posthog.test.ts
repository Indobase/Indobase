import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as common from 'common'
import { trackFeatureFlag } from './posthog'

vi.mock('common', () => ({
  hasConsented: vi.fn(),
  LOCAL_STORAGE_KEYS: {},
}))

describe('trackFeatureFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns undefined if user has not consented', async () => {
    vi.spyOn(common, 'hasConsented').mockReturnValue(false)
    const result = await trackFeatureFlag({ some: 'value' } as any)
    expect(result).toBeUndefined()
  })

  it('returns undefined when consented (hosted telemetry removed)', async () => {
    vi.spyOn(common, 'hasConsented').mockReturnValue(true)
    const result = await trackFeatureFlag({ foo: 'bar' } as any)
    expect(result).toBeUndefined()
  })
})
