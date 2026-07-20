import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const posthogInit = vi.fn()
const posthogCaptureException = vi.fn()

vi.mock('posthog-js', () => ({
  default: {
    init: posthogInit,
    captureException: posthogCaptureException,
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    group: vi.fn(),
    get_distinct_id: vi.fn(),
    get_session_id: vi.fn(),
  },
}))

describe('PostHogClient', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key')
    vi.stubGlobal('window', {} as Window)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('enables error-tracking autocapture during init', async () => {
    const { posthogClient } = await import('./posthog-client')

    posthogClient.init(true)

    expect(posthogInit).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({
        capture_exceptions: {
          capture_unhandled_errors: true,
          capture_unhandled_rejections: true,
          capture_console_errors: false,
        },
      })
    )
  })

  it('does not init without consent', async () => {
    const { posthogClient } = await import('./posthog-client')

    posthogClient.init(false)

    expect(posthogInit).not.toHaveBeenCalled()
  })

  it('captureException forwards normalized errors when initialized', async () => {
    const { posthogClient } = await import('./posthog-client')

    posthogInit.mockImplementation((_key, config) => {
      config.loaded?.({} as never)
    })

    posthogClient.init(true)
    posthogClient.captureException('boom', { surface: 'test' })

    expect(posthogCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      surface: 'test',
    })
    expect(posthogCaptureException.mock.calls[0][0].message).toBe('boom')
  })
})
