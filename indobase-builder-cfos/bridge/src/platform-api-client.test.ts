import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'

import { PlatformApiRoutes } from '@indobase/platform-api'

import { resolvePlatformApiUrl } from './platform-api-client.ts'

describe('platform-api-client', () => {
  const prev = process.env.PLATFORM_API_URL

  after(() => {
    if (prev === undefined) delete process.env.PLATFORM_API_URL
    else process.env.PLATFORM_API_URL = prev
  })

  it('prefers PLATFORM_API_URL', () => {
    process.env.PLATFORM_API_URL = 'http://control-plane:8080/'
    assert.equal(resolvePlatformApiUrl(), 'http://control-plane:8080')
  })

  it('falls back to STUDIO_INTERNAL_URL', () => {
    delete process.env.PLATFORM_API_URL
    process.env.STUDIO_INTERNAL_URL = 'http://studio:8080'
    assert.equal(resolvePlatformApiUrl(), 'http://studio:8080')
  })

  it('exposes OS prompt-quota Platform route', () => {
    assert.equal(PlatformApiRoutes.promptQuota, '/api/os/v1/usage/prompt-quota')
  })
})
