import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  KNOWN_DEMO_SUPABASE_ANON_KEY,
  resolvePublicAnonKey,
  resolvePublicGotrueUrl,
  resolvePublicSiteUrl,
  resolveServerPublicAnonKey,
  resolveServerPublicSiteUrl,
} from './public-env'

describe('resolveServerPublicAnonKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefers runtime SUPABASE_ANON_KEY over baked NEXT_PUBLIC demo key', () => {
    vi.stubEnv('SUPABASE_ANON_KEY', 'runtime-prod-key')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', KNOWN_DEMO_SUPABASE_ANON_KEY)
    vi.stubEnv('NEXT_PUBLIC_ANON_KEY', KNOWN_DEMO_SUPABASE_ANON_KEY)

    expect(resolveServerPublicAnonKey()).toBe('runtime-prod-key')
  })

  it('ignores the known demo anon key', () => {
    vi.stubEnv('SUPABASE_ANON_KEY', '')
    vi.stubEnv('ANON_KEY', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', KNOWN_DEMO_SUPABASE_ANON_KEY)

    expect(resolveServerPublicAnonKey()).toBe('')
  })
})

describe('resolvePublicAnonKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as typeof globalThis & { window?: Window }).window
  })

  it('prefers usable runtime-injected window config', () => {
    vi.stubEnv('NEXT_PUBLIC_ANON_KEY', KNOWN_DEMO_SUPABASE_ANON_KEY)
    ;(globalThis as typeof globalThis & { window: Window }).window = {
      __INDOBASE_PUBLIC_ENV__: { anonKey: 'runtime-key' },
    } as Window

    expect(resolvePublicAnonKey()).toBe('runtime-key')
  })

  it('ignores injected demo key and falls back to server env', () => {
    vi.stubEnv('SUPABASE_ANON_KEY', 'runtime-prod-key')
    ;(globalThis as typeof globalThis & { window: Window }).window = {
      __INDOBASE_PUBLIC_ENV__: { anonKey: KNOWN_DEMO_SUPABASE_ANON_KEY },
    } as Window

    expect(resolvePublicAnonKey()).toBe('runtime-prod-key')
  })
})

describe('resolvePublicGotrueUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as typeof globalThis & { window?: Window }).window
  })

  it('prefers runtime-injected gotrue url', () => {
    vi.stubEnv('NEXT_PUBLIC_GOTRUE_URL', 'https://build.example/auth/v1')
    ;(globalThis as typeof globalThis & { window: Window }).window = {
      __INDOBASE_PUBLIC_ENV__: { gotrueUrl: 'https://runtime.example/auth/v1' },
    } as Window

    expect(resolvePublicGotrueUrl()).toBe('https://runtime.example/auth/v1')
  })
})

describe('resolvePublicSiteUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as typeof globalThis & { window?: Window }).window
  })

  it('prefers runtime-injected siteUrl over bake-time env', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://studio.indobase.in')
    ;(globalThis as typeof globalThis & { window: Window }).window = {
      __INDOBASE_PUBLIC_ENV__: { siteUrl: 'https://studio.indobase.fun' },
    } as Window

    expect(resolvePublicSiteUrl()).toBe('https://studio.indobase.fun')
  })

  it('reads SITE_URL on the server', () => {
    vi.stubEnv('SITE_URL', 'https://studio.indobase.fun/')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://studio.indobase.in')
    expect(resolveServerPublicSiteUrl()).toBe('https://studio.indobase.fun')
  })
})
