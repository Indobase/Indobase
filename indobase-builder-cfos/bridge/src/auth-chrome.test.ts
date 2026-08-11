import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { injectAuthChrome } from './auth-chrome.ts'
import { injectIndobaseContextBootstrap } from './workspace-html.ts'

describe('auth-chrome', () => {
  it('injects account modal (no floating fab) wired to /auth/start and /auth/verify', () => {
    const html = injectAuthChrome('<html><body><div id="app"></div></body></html>')
    assert.match(html, /Create your Indobase account/)
    assert.doesNotMatch(html, /id="ib-auth-fab"/)
    assert.match(html, /id="ib-auth-modal"/)
    assert.match(html, /\/auth\/start/)
    assert.match(html, /\/auth\/verify/)
    assert.match(html, /dpdpConsent/)
    assert.match(html, /indobase:open-auth/)
    assert.match(html, /Privacy Policy/)
    assert.match(html, /rate_limited|Too many attempts/)
  })

  it('context bootstrap includes auth chrome + session stage fields', () => {
    const html = injectIndobaseContextBootstrap('<html><body><main></main></body></html>')
    assert.match(html, /Create your Indobase account/)
    assert.doesNotMatch(html, /id="ib-auth-fab"/)
    assert.match(html, /__INDOBASE_SESSION_STAGE__/)
    assert.match(html, /__INDOBASE_GUEST__/)
    assert.match(html, /__INDOBASE_AUTH__/)
    assert.match(html, /STAGE:/)
    assert.match(html, /ui:\s*true/)
  })
})
