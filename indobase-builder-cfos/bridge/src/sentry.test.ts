import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { injectBrowserSentry, resolveSentryDsn } from './sentry.ts'

describe('sentry', () => {
  afterEach(() => {
    delete process.env.SENTRY_DSN
    delete process.env.PUBLIC_SENTRY_DSN
    delete process.env.SENTRY_ENVIRONMENT
    delete process.env.GIT_SHA
  })

  it('resolveSentryDsn prefers SENTRY_DSN', () => {
    process.env.PUBLIC_SENTRY_DSN = 'https://public@example/1'
    process.env.SENTRY_DSN = 'https://primary@example/2'
    assert.equal(resolveSentryDsn(), 'https://primary@example/2')
  })

  it('injectBrowserSentry is a no-op without DSN', () => {
    const html = '<html><head></head><body>ok</body></html>'
    assert.equal(injectBrowserSentry(html), html)
  })

  it('injectBrowserSentry injects loader before </head>', () => {
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.us.sentry.io/2'
    process.env.SENTRY_ENVIRONMENT = 'production'
    process.env.GIT_SHA = 'deadbeef'
    const out = injectBrowserSentry('<html><head><title>x</title></head><body></body></html>')
    assert.match(out, /browser\.sentry-cdn\.com/)
    assert.match(out, /https:\/\/abc@o1\.ingest\.us\.sentry\.io\/2/)
    assert.match(out, /environment: "production"/)
    assert.match(out, /release: "deadbeef"/)
    assert.match(out, /<\/head>/)
  })
})
