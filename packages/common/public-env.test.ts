import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolvePublicAnonKey, resolvePublicGotrueUrl } from './public-env'

describe('resolvePublicAnonKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as typeof globalThis & { window?: Window }).window
  })

  it('prefers runtime-injected window config over build-time env', () => {
    vi.stubEnv('NEXT_PUBLIC_ANON_KEY', 'build-time-key')
    ;(globalThis as typeof globalThis & { window: Window }).window = {
      __INDOBASE_PUBLIC_ENV__: { anonKey: 'runtime-key' },
    } as Window

    expect(resolvePublicAnonKey()).toBe('runtime-key')
  })

  it('falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY then NEXT_PUBLIC_ANON_KEY', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'supabase-public-key')
    vi.stubEnv('NEXT_PUBLIC_ANON_KEY', 'legacy-public-key')

    expect(resolvePublicAnonKey()).toBe('supabase-public-key')
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
