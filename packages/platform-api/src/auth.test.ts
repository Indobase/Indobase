import { afterEach, describe, expect, it, vi } from 'vitest'

import { verifyOsApiSecret } from './auth'

describe('@indobase/platform-api auth', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts matching OS API secret', () => {
    const secret = 'a'.repeat(32)
    vi.stubEnv('BUILDER_CFOS_HANDOFF_SECRET', secret)
    expect(verifyOsApiSecret(secret)).toBe(true)
  })

  it('rejects wrong secret', () => {
    vi.stubEnv('BUILDER_CFOS_HANDOFF_SECRET', 'a'.repeat(32))
    expect(verifyOsApiSecret('b'.repeat(32))).toBe(false)
  })
})
