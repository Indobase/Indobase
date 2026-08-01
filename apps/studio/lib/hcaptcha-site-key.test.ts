import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveHcaptchaSiteKey } from './hcaptcha-site-key'

describe('resolveHcaptchaSiteKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as typeof globalThis & { window?: Window }).window
  })

  it('returns undefined when no candidates are set', () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_SITE_KEY', '')
    vi.stubEnv('HCAPTCHA_SITE_KEY', '')
    expect(resolveHcaptchaSiteKey()).toBeUndefined()
    expect(resolveHcaptchaSiteKey(null)).toBeUndefined()
    expect(resolveHcaptchaSiteKey('   ')).toBeUndefined()
  })

  it('prefers an explicit runtime key argument', () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_SITE_KEY', 'baked-key')
    expect(resolveHcaptchaSiteKey('  runtime-arg-key  ')).toBe('runtime-arg-key')
  })

  it('reads injected window config when env is blank', () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_SITE_KEY', '')
    ;(globalThis as typeof globalThis & { window: Window }).window = {
      __INDOBASE_PUBLIC_ENV__: { hcaptchaSiteKey: ' injected-key ' },
    } as Window

    expect(resolveHcaptchaSiteKey()).toBe('injected-key')
  })

  it('falls back to NEXT_PUBLIC_HCAPTCHA_SITE_KEY', () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_SITE_KEY', ' baked-public-key ')
    expect(resolveHcaptchaSiteKey()).toBe('baked-public-key')
  })
})
