import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { brandDiscussHtml, shouldBrandDiscussResponse } from './brand-html.js'

describe('brandDiscussHtml', () => {
  it('replaces title and injects favicon', () => {
    const html =
      '<!doctype html><html><head><title>Mattermost</title></head><body>ok</body></html>'
    const out = brandDiscussHtml(html)
    assert.match(out, /<title>Indobase Discuss<\/title>/)
    assert.match(out, /indobase-favicon\.svg/)
    assert.equal(/Mattermost/i.test(out), false)
  })

  it('updates application-name meta', () => {
    const html =
      '<head><meta name="application-name" content="Mattermost" /><title>x</title></head>'
    const out = brandDiscussHtml(html)
    assert.match(out, /content="Indobase Discuss"/)
  })

  it('shouldBrandDiscussResponse only for HTML', () => {
    assert.equal(shouldBrandDiscussResponse('text/html; charset=utf-8'), true)
    assert.equal(shouldBrandDiscussResponse('application/json'), false)
    assert.equal(shouldBrandDiscussResponse('text/css'), false)
  })
})
