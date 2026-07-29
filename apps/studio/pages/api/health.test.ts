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
    vi.stubEnv('STUDIO_PG_META_URL', 'http://indobase-meta:8080')
    vi.stubEnv('POSTGRES_PASSWORD', 'postgres')
    vi.stubEnv('PG_META_CRYPTO_KEY', 'x'.repeat(32))

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await computeHealth()
    expect(result.status).toBe('ok')
    expect(result.checks.env.status).toBe('ok')
    expect(result.checks.saasInfra.status).toBe('ok')
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

  it('returns degraded in SaaS mode when control-plane env is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_INDOBASE_SAAS', 'true')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://studio.indobase.in')
    vi.stubEnv('SUPABASE_URL', 'https://api.indobase.in')
    vi.stubEnv('GOTRUE_URL', 'https://api.indobase.in/auth/v1')
    vi.stubEnv('STUDIO_PG_META_URL', '')
    vi.stubEnv('POSTGRES_PASSWORD', '')
    vi.stubEnv('PG_META_CRYPTO_KEY', '')
    vi.stubEnv('CRYPTO_KEY', '')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    const result = await computeHealth()
    expect(result.status).toBe('degraded')
    expect(result.checks.saasInfra.status).toBe('degraded')
    expect(result.checks.saasInfra.missing).toEqual(
      expect.arrayContaining(['STUDIO_PG_META_URL', 'POSTGRES_PASSWORD', 'encryption key'])
    )
  })

  it('skips saasInfra check when SaaS is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_INDOBASE_SAAS', 'false')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://studio.example.com')
    vi.stubEnv('SUPABASE_URL', 'https://api.example.com')
    vi.stubEnv('GOTRUE_URL', 'https://api.example.com/auth/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    const result = await computeHealth()
    expect(result.checks.saasInfra.status).toBe('ok')
  })
})
