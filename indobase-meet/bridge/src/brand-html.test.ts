import assert from 'node:assert/strict'
import test from 'node:test'

import { brandMeetHtml, shouldBrandMeetResponse } from './brand-html.js'

test('shouldBrandMeetResponse only HTML', () => {
  assert.equal(shouldBrandMeetResponse('text/html; charset=utf-8'), true)
  assert.equal(shouldBrandMeetResponse('application/json'), false)
})

test('brandMeetHtml sets Indobase Meet title and favicon', () => {
  const out = brandMeetHtml(
    '<!doctype html><html><head><title>Jitsi Meet</title><link rel="icon" href="/favicon.ico"></head><body><noscript>Jitsi</noscript></body></html>'
  )
  assert.match(out, /<title>Indobase Meet<\/title>/)
  assert.match(out, /indobase-favicon\.svg/)
  assert.match(out, /Indobase Meet/)
  assert.doesNotMatch(out, /<title>Jitsi Meet<\/title>/)
  assert.match(out, /indobase-meet-brand-css/)
  /*
   * The brand script is injected as an EXTERNAL src, not inline. An upstream
   * `script-src 'self'` CSP meta refuses inline <script> silently — the rebrand just
   * never applies. Asserting the external tag (and the absence of the inline one) is
   * what stops someone inlining it again and quietly breaking every rewrite.
   */
  assert.match(out, /<script src="\/brand\/meet-brand\.js" defer><\/script>/)
  assert.equal(/<script id=["']indobase-meet-brand-js["']/.test(out), false)
})
