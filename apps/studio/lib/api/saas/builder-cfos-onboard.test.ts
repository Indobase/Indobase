import { afterEach, describe, expect, it, vi } from 'vitest'

import { verifyBuilderCfosBridgeSecret } from './builder-cfos-onboard'

describe('builder-cfos-onboard', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts matching bridge secret', () => {
    const secret = 'a'.repeat(32)
    vi.stubEnv('BUILDER_CFOS_HANDOFF_SECRET', secret)
    expect(verifyBuilderCfosBridgeSecret(secret)).toBe(true)
  })

  it('rejects wrong bridge secret', () => {
    vi.stubEnv('BUILDER_CFOS_HANDOFF_SECRET', 'a'.repeat(32))
    expect(verifyBuilderCfosBridgeSecret('b'.repeat(32))).toBe(false)
  })

  it('rejects missing bridge secret', () => {
    vi.stubEnv('BUILDER_CFOS_HANDOFF_SECRET', 'a'.repeat(32))
    expect(verifyBuilderCfosBridgeSecret(undefined)).toBe(false)
  })
})
