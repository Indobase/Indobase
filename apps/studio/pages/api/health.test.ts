import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computeHealth } from './health'

describe('health api', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns ok when env and upstream checks pass', async () => {
    vi.stubEnv('NEXT_PUBLIC_INDOBASE_SAAS', 'true')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://studio.indobase.in')
    vi.stubEnv('SUPABASE_URL', 'https://api.indobase.in')
    vi.stubEnv('GOTRUE_URL', 'https://api.indobase.in/auth/v1')

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await computeHealth()
    expect(result.status).toBe('ok')
    expect(result.checks.env.status).toBe('ok')
    expect(result.checks.gotrue.status).toBe('ok')
    expect(result.checks.rest.status).toBe('ok')
  })

  it('returns degraded when required env is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    const result = await computeHealth()
    expect(result.status).toBe('degraded')
    expect(result.checks.env.status).toBe('degraded')
    expect(result.checks.env.missing).toEqual(
      expect.arrayContaining(['NEXT_PUBLIC_INDOBASE_SAAS', 'NEXT_PUBLIC_SITE_URL', 'SUPABASE_URL'])
    )
  })
})
