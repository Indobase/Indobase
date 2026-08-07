import { afterEach, describe, expect, it, vi } from 'vitest'

import { publishOsWorkspace } from './os-deploy'

const mockLaunch = vi.fn()

vi.mock('./os-business-launch', () => ({
  launchOsBusinessForApi: (...args: unknown[]) => mockLaunch(...args),
}))

describe('publishOsWorkspace', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('delegates to business.launch API wrapper', async () => {
    mockLaunch.mockResolvedValue({
      ok: true,
      status: 'published',
      url: 'https://ws_ref.indobase.in',
      message: 'Your business is now live',
    })

    const claims = { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never
    const result = await publishOsWorkspace({
      claims,
      workspaceRef: 'ws_ref',
      requiredCapabilities: ['auth'],
    })

    expect(mockLaunch).toHaveBeenCalledWith({
      claims,
      workspaceRef: 'ws_ref',
      reason: 'os_launch',
      intent: undefined,
      requiredCapabilities: ['auth'],
      payload: undefined,
    })
    expect(result).toEqual({
      ok: true,
      status: 'published',
      url: 'https://ws_ref.indobase.in',
      message: 'Your business is now live',
    })
  })

  it('forwards queued and failed statuses unchanged', async () => {
    mockLaunch.mockResolvedValueOnce({
      ok: true,
      status: 'queued',
      url: 'https://ws_ref.indobase.in',
      message: "We're finishing your business setup. Your live link is reserved.",
    })

    const queued = await publishOsWorkspace({
      claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never,
      workspaceRef: 'ws_ref',
    })
    expect(queued.status).toBe('queued')

    mockLaunch.mockResolvedValueOnce({
      ok: false,
      status: 'failed',
      message: 'We could not launch your business right now. Please try again.',
    })

    const failed = await publishOsWorkspace({
      claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never,
      workspaceRef: 'ws_ref',
    })
    expect(failed).toEqual({
      ok: false,
      status: 'failed',
      message: 'We could not launch your business right now. Please try again.',
    })
  })
})
