import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildBuilderCfosLaunchUrl,
  isBuilderCfosEnabled,
  makeBuilderCfosHandoffToken,
  resolveBuilderCfosBaseUrl,
} from './builder-cfos-launch'

describe('builder-cfos-launch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is off by default', () => {
    expect(isBuilderCfosEnabled()).toBe(false)
  })

  it('enables via BUILDER_USE_CFOS', () => {
    vi.stubEnv('BUILDER_USE_CFOS', '1')
    expect(isBuilderCfosEnabled()).toBe(true)
  })

  it('builds sso launch URL with token in fragment', () => {
    expect(
      buildBuilderCfosLaunchUrl({
        baseUrl: 'http://127.0.0.1:8791',
        handoffToken: 'a.b.c',
        projectRef: 'proj_1',
        next: '/',
      })
    ).toBe('http://127.0.0.1:8791/sso/launch?project_ref=proj_1&next=%2F#token=a.b.c')
  })

  it('resolves base URL from env', () => {
    vi.stubEnv('BUILDER_CFOS_APP_URL', 'https://builder-v2.example/')
    expect(resolveBuilderCfosBaseUrl()).toBe('https://builder-v2.example')
  })

  it('signs HS256 tokens', () => {
    const token = makeBuilderCfosHandoffToken(
      { aud: 'indobase-builder-cfos', project_ref: 'x', exp: 1, iat: 1 },
      'y'.repeat(32)
    )
    expect(token.split('.')).toHaveLength(3)
  })
})
