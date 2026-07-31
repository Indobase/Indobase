import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  brandCalendarHtml,
  scrubCalendarShell,
  shouldBrandCalendarResponse,
} from './brand-html.js'

const SAMPLE_SHELL = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/>
<title>Cal.com</title>
<meta name="application-name" content="Cal.com"/>
<meta property="og:title" content="Welcome to Cal.com"/>
<link rel="icon" href="/favicon.ico"/>
<link rel="manifest" href="/site.webmanifest"/>
<style>
:root { --font-sans: Inter; --font-cal: calFont, calFont Fallback; }
</style>
</head><body>
<aside><small class="text-default">© 2026 <a href="https://go.cal.com/credits">Cal.com, Inc.</a></small></aside>
<noscript>Enable JavaScript to use Cal.com</noscript>
<p>Welcome to Cal.com scheduling</p>
<script>window.__I18N__={"welcome":"Welcome to Cal.com","email":"support@cal.com"};</script>
</body></html>`

describe('brandCalendarHtml', () => {
  it('shouldBrandCalendarResponse only for HTML', () => {
    assert.equal(shouldBrandCalendarResponse('text/html; charset=utf-8'), true)
    assert.equal(shouldBrandCalendarResponse('application/json'), false)
    assert.equal(shouldBrandCalendarResponse('text/css'), false)
  })

  it('replaces title and injects Indobase favicons', () => {
    const out = brandCalendarHtml(SAMPLE_SHELL)
    assert.match(out, /<title>Indobase Calendar<\/title>/)
    assert.match(out, /indobase-favicon\.svg/)
    assert.match(out, /indobase-favicon-32\.png/)
    assert.doesNotMatch(out, /<title>Cal\.com<\/title>/)
    assert.equal(/favicon\.ico/.test(out), false)
    assert.equal(/site\.webmanifest/.test(out), false)
  })

  it('updates branded meta tags', () => {
    const out = brandCalendarHtml(SAMPLE_SHELL)
    assert.match(out, /name="application-name" content="Indobase Calendar"/)
    assert.match(out, /og:title" content="Indobase Calendar"/)
  })

  it('scrubs visible shell copy but leaves script bodies intact', () => {
    const out = brandCalendarHtml(SAMPLE_SHELL)
    assert.match(out, /<p>Welcome to Indobase Calendar scheduling<\/p>/)
    assert.match(out, /Enable JavaScript to use Indobase Calendar/)
    assert.match(out, /href="#"/)
    assert.doesNotMatch(out, /go\.cal\.com\/credits/)
    assert.doesNotMatch(out, /Cal\.com, Inc\./)
    // Compiled i18n inside <script> must not be rewritten (SPA integrity).
    assert.match(out, /Welcome to Cal\.com/)
    assert.match(out, /support@cal\.com/)
  })

  it('neutralizes calFont in inline style blocks', () => {
    const out = brandCalendarHtml(SAMPLE_SHELL)
    assert.match(out, /--font-cal: Inter, system-ui, sans-serif/)
    assert.doesNotMatch(out, /calFont/)
  })

  it('injects brand CSS and JS hooks', () => {
    const out = brandCalendarHtml(SAMPLE_SHELL)
    assert.match(out, /indobase-calendar-brand-css/)
    assert.match(out, /indobase-calendar-brand-js/)
    assert.match(out, /go\.cal\.com/)
  })
})

describe('scrubCalendarShell', () => {
  it('rewrites text nodes and anchor hrefs outside scripts', () => {
    const out = scrubCalendarShell(
      '<div>Cal.com footer <a href="https://cal.com/signup">Join</a></div>'
    )
    assert.match(out, /Indobase Calendar footer/)
    assert.match(out, /href="#"/)
    assert.doesNotMatch(out, /cal\.com\/signup/)
  })
})
