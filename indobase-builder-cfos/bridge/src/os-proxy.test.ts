import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveCloudflareOsBase, rewriteHtmlForProxyPrefix } from './os-proxy.ts'

describe('os-proxy', () => {
  it('trims trailing slash from CLOUDFLARE_OS_URL', () => {
    const prev = process.env.CLOUDFLARE_OS_URL
    process.env.CLOUDFLARE_OS_URL = 'http://127.0.0.1:8787/'
    assert.equal(resolveCloudflareOsBase(), 'http://127.0.0.1:8787')
    if (prev === undefined) delete process.env.CLOUDFLARE_OS_URL
    else process.env.CLOUDFLARE_OS_URL = prev
  })

  it('rewrites root-absolute asset URLs under the proxy prefix', () => {
    const html =
      '<script src="/assets/index.js"></script><link href="/favicon.svg"/><a href="/os/app/keep">'
    const out = rewriteHtmlForProxyPrefix(html, '/os/app')
    assert.match(out, /src="\/os\/app\/assets\/index\.js"/)
    assert.match(out, /href="\/os\/app\/favicon\.svg"/)
    assert.match(out, /href="\/os\/app\/keep"/)
  })
})
