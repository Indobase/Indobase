import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildUpstreamProxyHeaders,
  sanitizeProxiedResponseHeaders,
} from './proxy-headers.js'

describe('sanitizeProxiedResponseHeaders', () => {
  it('strips content-encoding and content-length after undici decode', () => {
    const headers = new Headers({
      'content-type': 'text/css; charset=utf-8',
      'content-encoding': 'gzip',
      'content-length': '1824',
      'transfer-encoding': 'chunked',
      'cache-control': 'max-age=31556926, public',
      server: 'nginx',
    })
    const out = sanitizeProxiedResponseHeaders(headers)
    assert.equal(out.get('content-type'), 'text/css; charset=utf-8')
    assert.equal(out.get('cache-control'), 'max-age=31556926, public')
    assert.equal(out.get('content-encoding'), null)
    assert.equal(out.get('content-length'), null)
    assert.equal(out.get('transfer-encoding'), null)
    assert.equal(out.get('server'), null)
  })
})

describe('buildUpstreamProxyHeaders', () => {
  it('forces identity accept-encoding and drops hop-by-hop headers', () => {
    const incoming = new Headers({
      host: 'discuss.indobase.in',
      'accept-encoding': 'gzip, deflate, br',
      cookie: 'sid=abc',
      connection: 'keep-alive',
    })
    const out = buildUpstreamProxyHeaders(incoming)
    assert.equal(out.get('accept-encoding'), 'identity')
    assert.equal(out.get('cookie'), 'sid=abc')
    assert.equal(out.get('host'), null)
    assert.equal(out.get('connection'), null)
  })
})
