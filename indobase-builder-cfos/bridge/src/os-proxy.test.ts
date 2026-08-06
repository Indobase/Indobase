import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveCloudflareOsBase } from './os-proxy.ts'

describe('os-proxy', () => {
  it('trims trailing slash from CLOUDFLARE_OS_URL', () => {
    const prev = process.env.CLOUDFLARE_OS_URL
    process.env.CLOUDFLARE_OS_URL = 'http://127.0.0.1:8787/'
    assert.equal(resolveCloudflareOsBase(), 'http://127.0.0.1:8787')
    if (prev === undefined) delete process.env.CLOUDFLARE_OS_URL
    else process.env.CLOUDFLARE_OS_URL = prev
  })
})
