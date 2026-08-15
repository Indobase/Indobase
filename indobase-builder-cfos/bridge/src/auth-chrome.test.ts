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
    assert.match(html, /__INDOBASE_PREVIEW_URL__/)
    assert.match(html, /PREVIEW_URL:/)
    assert.match(html, /__INDOBASE_PROJECT__/)
    assert.match(html, /PROJECT:/)
  })

  it('hides the guest auth modal when signed in and never says enable backends', () => {
    const html = injectAuthChrome('<html><body><div id="app"></div></body></html>')
    assert.doesNotMatch(html, /enable backends/i)
    assert.match(html, /data-ib-signed-in/)
    assert.match(html, /signedInFromWindow/)
    assert.match(html, /GUEST === false/)
    const boot = injectIndobaseContextBootstrap('<html><body><main></main></body></html>')
    assert.doesNotMatch(boot, /enable backends/i)
    assert.match(boot, /hideOperatorToolPills/)
    assert.match(boot, /__INDOBASE_PREVIEW_STATUS__/)
  })

  it('does not inject Create-account chrome for signed-in members', () => {
    const html = injectAuthChrome('<html><body><div id="app"></div></body></html>', { guest: false })
    assert.doesNotMatch(html, /Create your Indobase account/)
    assert.doesNotMatch(html, /id="ib-auth-modal"/)
    const boot = injectIndobaseContextBootstrap('<html><body><main></main></body></html>', { guest: false })
    assert.doesNotMatch(boot, /Create your Indobase account/)
    assert.match(boot, /__INDOBASE_SESSION_STAGE__/)
  })
})
