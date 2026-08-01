import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { brandDiscussHtml, DISCUSS_BRAND_NAME, shouldBrandDiscussResponse } from './brand-html.js'

describe('brandDiscussHtml', () => {
  it('rewrites title and visible Gameplan text', () => {
    const html = `<!doctype html><html><head><title>Gameplan</title></head><body><h1>Welcome to Gameplan</h1><script>var x="Gameplan"</script></body></html>`
    const out = brandDiscussHtml(html)
    assert.match(out, new RegExp(`<title>${DISCUSS_BRAND_NAME}</title>`))
    assert.match(out, /Welcome to Discuss/)
    assert.match(out, /var x="Gameplan"/)
    assert.match(out, /indobase-favicon\.svg/)
    assert.match(out, /\/brand\/discuss-brand\.js/)
  })

  it('replaces engine manifest and apple icons with Indobase brand assets', () => {
    const html = `<!doctype html><html><head>
<title>Gameplan</title>
<link rel="manifest" href="/assets/gameplan/manifest/site.webmanifest" />
<link rel="apple-touch-icon" href="/assets/gameplan/manifest/apple-icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="application-name" content="Gameplan" />
</head><body></body></html>`
    const out = brandDiscussHtml(html)
    assert.match(out, /href="\/brand\/manifest\.json"/)
    assert.doesNotMatch(out, /site\.webmanifest/)
    assert.doesNotMatch(out, /apple-icon-180/)
    assert.doesNotMatch(out, /apple-mobile-web-app-capable/)
    assert.match(out, /name="mobile-web-app-capable"/)
    assert.match(out, new RegExp(`content="${DISCUSS_BRAND_NAME}"`))
  })

  it('only brands html content types', () => {
    assert.equal(shouldBrandDiscussResponse('text/html; charset=utf-8'), true)
    assert.equal(shouldBrandDiscussResponse('application/javascript'), false)
  })
})
