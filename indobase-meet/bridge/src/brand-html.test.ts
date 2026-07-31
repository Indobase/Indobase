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
  assert.match(out, /indobase-meet-brand-js/)
})
