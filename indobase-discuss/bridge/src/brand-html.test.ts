import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { brandDiscussHtml, shouldBrandDiscussResponse } from './brand-html.js'

const SAMPLE_SHELL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mattermost</title><meta name="application-name" content="Mattermost"><meta name="apple-mobile-web-app-title" content="Mattermost" /><link rel="icon" type="image/png" href="/static/images/favicon/favicon-default-16x16.png" sizes="16x16"><link rel="manifest" href="/static/manifest.json" /><link id="initialLoadingScreenCSS" rel="stylesheet" href="/static/css/initial_loading_screen.css"></head><body class="font--open_sans"><div id="initialPageLoadingScreen" class="LoadingScreen LoadingScreen--darkMode"><div class="LoadingScreen__background"><svg viewBox="0 0 1366 728" xmlns="http://www.w3.org/2000/svg"><g id="pill" class="Pill"></g></svg></div><div id="initialPageLoadingAnimation" class="LoadingAnimation"></div></div><div id="root"></div><noscript>To use Mattermost, please enable JavaScript.</noscript></body></html>`

describe('brandDiscussHtml', () => {
  it('replaces title and injects Indobase favicons', () => {
    const out = brandDiscussHtml(SAMPLE_SHELL)
    assert.match(out, /<title>Indobase Discuss<\/title>/)
    assert.match(out, /indobase-favicon\.svg/)
    assert.match(out, /indobase-favicon-32\.png/)
    assert.equal(/favicon-default/i.test(out), false)
  })

  it('updates application-name and apple-mobile-web-app-title', () => {
    const out = brandDiscussHtml(SAMPLE_SHELL)
    assert.match(out, /name="application-name" content="Indobase Discuss"/)
    assert.match(out, /apple-mobile-web-app-title" content="Indobase Discuss"/)
  })

  it('replaces LoadingScreen pills with Indobase cold-load chrome', () => {
    const out = brandDiscussHtml(SAMPLE_SHELL)
    assert.match(out, /Opening Indobase Discuss/)
    assert.match(out, /indobase-logo-mark-80\.png/)
    assert.equal(/id=["']pill["']/.test(out), false)
    assert.equal(/viewBox="0 0 1366 728"/.test(out), false)
    // Original animation node gone (CSS may still mention the id as a hide selector).
    assert.equal(/id=["']initialPageLoadingAnimation["']/.test(out), false)
    assert.match(out, /indobase-discuss-brand-css/)
    // Must not pin the splash with display:!important — that traps the SPA forever.
    assert.equal(/#initialPageLoadingScreen[\s\S]*?display:\s*flex\s*!important/.test(out), false)
    /*
     * The brand script is injected as an EXTERNAL src, not inline. Mattermost's shell ships
     * `script-src 'self' cdn.rudderlabs.com/`, which refuses an inline <script> with no nonce —
     * the inline version silently never ran in production. Asserting the external tag here is
     * what stops someone "simplifying" it back to inline and re-breaking every text rewrite.
     */
    assert.match(out, /<script src="\/brand\/discuss-brand\.js" defer><\/script>/)
    assert.equal(/<script id=["']indobase-discuss-brand-js["']/.test(out), false)
  })

  it('rewrites noscript Mattermost copy', () => {
    const out = brandDiscussHtml(SAMPLE_SHELL)
    const noscript = out.match(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/i)?.[0] ?? ''
    assert.match(noscript, /To use Indobase Discuss/)
    assert.equal(/Mattermost/i.test(noscript), false)
  })

  it('shouldBrandDiscussResponse only for HTML', () => {
    assert.equal(shouldBrandDiscussResponse('text/html; charset=utf-8'), true)
    assert.equal(shouldBrandDiscussResponse('application/json'), false)
    assert.equal(shouldBrandDiscussResponse('text/css'), false)
  })
})
