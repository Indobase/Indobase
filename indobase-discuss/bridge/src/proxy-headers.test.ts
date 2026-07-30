import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sanitizeProxiedResponseHeaders } from './index.js'

describe('sanitizeProxiedResponseHeaders', () => {
  it('strips content-encoding and content-length after undici decode', () => {
    const headers = new Headers({
      'content-type': 'text/css; charset=utf-8',
      'content-encoding': 'gzip',
      'content-length': '1824',
      'cache-control': 'max-age=31556926, public',
      server: 'Mattermost',
      'x-version-id': '10.5.2',
    })
    const out = sanitizeProxiedResponseHeaders(headers)
    assert.equal(out.get('content-type'), 'text/css; charset=utf-8')
    assert.equal(out.get('cache-control'), 'max-age=31556926, public')
    assert.equal(out.get('content-encoding'), null)
    assert.equal(out.get('content-length'), null)
    assert.equal(out.get('server'), null)
    assert.equal(out.get('x-version-id'), null)
  })
})
