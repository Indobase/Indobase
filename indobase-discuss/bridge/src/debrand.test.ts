import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { brandDiscussHtml } from './brand-html.js'
import {
  DEBRAND_JS,
  DEBRAND_SCRIPT_PATH,
  MANIFEST_PATH,
  NOTICES_PATH,
  applyDiscussDebranding,
  debrandDocumentMeta,
  hasMeta,
  loadNoticeMarkdown,
  markdownToHtml,
  renderNoticesPage,
  resolvePublicBaseUrl,
} from './debrand.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * Shape of the real served shell (captured from the live proxy), including the
 * upstream `<meta http-equiv="Content-Security-Policy">` that refuses inline
 * <script> — the reason our brand JS must be same-origin and external.
 */
const SHELL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Mattermost</title><meta property="og:description" content="Team chat for your Indobase organization and project" /><meta name="application-name" content="Mattermost"><link rel="manifest" href="/static/manifest.json" /><meta http-equiv="Content-Security-Policy" content="script-src 'self' cdn.rudderlabs.com/"><script src="/static/main.abc.js"></script></head><body class="font--open_sans"><div id="initialPageLoadingScreen" class="LoadingScreen"><div id="initialPageLoadingAnimation" class="LoadingAnimation"></div></div><div id="root"></div><noscript>To use Mattermost, please enable JavaScript.</noscript></body></html>`

describe('applyDiscussDebranding', () => {
  it('injects the debrand stylesheet with stable, id-anchored selectors', () => {
    const out = applyDiscussDebranding(SHELL)
    assert.match(out, /<style id="indobase-discuss-debrand-css">/)
    // Header wordmark + FREE EDITION badge (sibling of the product switcher).
    assert.match(out, /#product_switch_menu ~ \*/)
    // Product menu "free unsupported edition" footer.
    assert.match(out, /#startTrial/)
    // Upstream help destinations.
    assert.match(out, /#mattermostUserGuideLink/)
    assert.match(out, /#trainingResourcesLink/)
    // About modal fingerprints.
    assert.match(out, /\.about-modal__hash/)
    assert.match(out, /aboutModalVersion/)
    // Header/footer route badge.
    assert.match(out, /\.hfroute-header \.freeBadge/)
  })

  it('never hides interactive siblings of the product switcher', () => {
    const out = applyDiscussDebranding(SHELL)
    assert.match(out, /#product_switch_menu ~ \*:not\(a\):not\(button\)/)
  })

  it('leaves the AGPL attribution block visible in the About modal', () => {
    const out = applyDiscussDebranding(SHELL)
    // Copyright + notice must not appear in any `display:none` selector list.
    assert.equal(/\.about-modal__copyright[^{]*\{[^}]*display:\s*none/.test(out), false)
    assert.equal(/\.about-modal__notice[^{]*\{[^}]*display:\s*none/.test(out), false)
  })

  it('loads brand JS from a same-origin file, not an inline block (CSP)', () => {
    const out = applyDiscussDebranding(SHELL)
    assert.match(out, new RegExp(`<script src="${DEBRAND_SCRIPT_PATH}" defer></script>`))
    // The upstream CSP meta is untouched and no nonce-less inline script is added.
    assert.match(out, /script-src 'self' cdn\.rudderlabs\.com\//)
    const injected = out.slice(out.indexOf('indobase-discuss-debrand-css'))
    assert.equal(/<script(?![^>]*\bsrc=)/i.test(injected), false)
  })

  it('is idempotent', () => {
    const once = applyDiscussDebranding(SHELL)
    const twice = applyDiscussDebranding(once)
    assert.equal(once, twice)
  })

  it('leaves non-document fragments alone', () => {
    const fragment = '<div class="post">Mattermost</div>'
    assert.equal(applyDiscussDebranding(fragment), fragment)
  })
})

describe('debrandDocumentMeta', () => {
  it('adds the unfurl + theme metadata the Mattermost shell omits', () => {
    const out = debrandDocumentMeta(SHELL, 'https://discuss.indobase.in')
    assert.match(out, /<meta property="og:title" content="Indobase Discuss" \/>/)
    assert.match(out, /<meta property="og:site_name" content="Indobase Discuss" \/>/)
    assert.match(out, /<meta property="og:type" content="website" \/>/)
    assert.match(
      out,
      /<meta property="og:image" content="https:\/\/discuss\.indobase\.in\/brand\/indobase-logo-mark\.png" \/>/
    )
    assert.match(out, /<meta property="og:url" content="https:\/\/discuss\.indobase\.in" \/>/)
    assert.match(out, /<meta name="description" content="Team chat for your Indobase/)
    assert.match(out, /<meta name="theme-color" content="#2585e6" \/>/)
    assert.match(out, /<meta name="twitter:card" content="summary" \/>/)
  })

  it('falls back to relative asset URLs when no public origin is configured', () => {
    const out = debrandDocumentMeta(SHELL, '')
    assert.match(out, /<meta property="og:image" content="\/brand\/indobase-logo-mark\.png" \/>/)
    assert.equal(hasMeta(out, 'property', 'og:url'), false)
  })

  it('does not clobber metadata the shell already carries', () => {
    const out = debrandDocumentMeta(SHELL, '')
    const matches = out.match(/property="og:description"/g) ?? []
    assert.equal(matches.length, 1)
    assert.match(out, /property="og:description" content="Team chat for your Indobase/)
  })

  it('ships an Indobase manifest and a machine-readable licence link', () => {
    // brandDiscussHtml strips Mattermost's manifest before we run.
    const stripped = SHELL.replace(/<link\b[^>]*\brel=["']manifest["'][^>]*>/gi, '')
    const out = debrandDocumentMeta(stripped, '')
    assert.match(out, new RegExp(`<link rel="manifest" href="${MANIFEST_PATH}" />`))
    assert.match(out, new RegExp(`<link rel="license" href="${NOTICES_PATH}" />`))
    assert.equal(/static\/manifest\.json/.test(out), false)
  })

  it('keeps an existing manifest link rather than adding a second one', () => {
    const out = debrandDocumentMeta(SHELL, '')
    assert.equal((out.match(/rel="manifest"/g) ?? []).length, 1)
  })
})

describe('resolvePublicBaseUrl', () => {
  it('prefers DISCUSS_PUBLIC_URL and trims trailing slashes', () => {
    assert.equal(
      resolvePublicBaseUrl({ DISCUSS_PUBLIC_URL: 'https://discuss.indobase.in/' }),
      'https://discuss.indobase.in'
    )
  })

  it('falls back to DISCUSS_SITE_URL', () => {
    assert.equal(
      resolvePublicBaseUrl({ DISCUSS_SITE_URL: 'https://discuss.indobase.fun' }),
      'https://discuss.indobase.fun'
    )
  })

  it('rejects unset or non-http values', () => {
    assert.equal(resolvePublicBaseUrl({}), '')
    assert.equal(resolvePublicBaseUrl({ DISCUSS_PUBLIC_URL: 'javascript:alert(1)' }), '')
    assert.equal(resolvePublicBaseUrl({ DISCUSS_PUBLIC_URL: '   ' }), '')
  })
})

describe('debrand brand script', () => {
  it('mounts the notices link and can never close the host document', () => {
    assert.match(DEBRAND_JS, new RegExp(NOTICES_PATH))
    assert.match(DEBRAND_JS, /product-switcher-menu/)
    assert.match(DEBRAND_JS, /about-modal/)
    assert.equal(DEBRAND_JS.includes('</script'), false)
  })

  it('guards every DOM mutation so a selector change cannot break the app', () => {
    assert.match(DEBRAND_JS, /try \{ mountProductMenu\(\); \} catch/)
    assert.match(DEBRAND_JS, /try \{ mountAboutModal\(\); \} catch/)
    assert.match(DEBRAND_JS, /try \{ mountStartCall\(\); \} catch/)
    assert.match(DEBRAND_JS, /Start call/)
    assert.match(DEBRAND_JS, /\/api\/meet\/start/)
    assert.doesNotMatch(DEBRAND_JS, /Jitsi|Mattermost/i)
  })
})

describe('markdownToHtml', () => {
  it('escapes HTML before rendering', () => {
    const out = markdownToHtml('Hello <script>alert(1)</script> world')
    assert.equal(out.includes('<script>'), false)
    assert.match(out, /&lt;script&gt;/)
  })

  it('renders headings, lists, bold and code', () => {
    const out = markdownToHtml('# Title\n\n- one `code`\n- **two**\n')
    assert.match(out, /<h2>Title<\/h2>/)
    assert.match(out, /<li>one <code>code<\/code><\/li>/)
    assert.match(out, /<li><strong>two<\/strong><\/li>/)
  })

  it('renders safe links and drops dangerous schemes', () => {
    const out = markdownToHtml('[upstream](https://github.com/mattermost/mattermost)')
    assert.match(out, /<a href="https:\/\/github\.com\/mattermost\/mattermost" rel="noopener noreferrer">upstream<\/a>/)
    const bad = markdownToHtml('[x](javascript:alert(1))')
    assert.equal(/javascript:/.test(bad), false)
    assert.match(bad, /x/)
  })
})

describe('open source notices page (AGPL §13)', () => {
  it('states the licence and where to get the corresponding source', () => {
    const page = renderNoticesPage('# Third-party attribution\n\nBody.')
    assert.match(page, /Open source notices/)
    assert.match(page, /GNU Affero General Public License/)
    assert.match(page, /github\.com\/mattermost\/mattermost/)
    assert.match(page, /unmodified/)
    assert.match(page, /support@indobase\.in/)
    assert.match(page, /<h2>Third-party attribution<\/h2>/)
  })

  it('reads NOTICE.md from disk when present', () => {
    const md = loadNoticeMarkdown(() => '# From disk\n\nAGPL-3.0 attribution.')
    assert.match(md, /From disk/)
  })

  it('falls back to an embedded notice when no file is readable', () => {
    const md = loadNoticeMarkdown(() => {
      throw new Error('ENOENT')
    })
    assert.match(md, /AGPL-3\.0/)
    assert.match(md, /github\.com\/mattermost\/mattermost/)
  })

  it('ships a notice copy inside the bridge image (public/ is COPYied)', () => {
    const shipped = readFileSync(path.resolve(HERE, '../public/brand/notices.md'), 'utf8')
    assert.match(shipped, /AGPL-3\.0/)
    assert.match(shipped, /github\.com\/mattermost\/mattermost/)
  })
})

describe('brandDiscussHtml integration', () => {
  it('emits the debrand lane on proxied HTML', () => {
    const out = brandDiscussHtml(SHELL)
    assert.match(out, /indobase-discuss-debrand-css/)
    assert.match(out, new RegExp(`src="${DEBRAND_SCRIPT_PATH}"`))
    assert.match(out, /rel="manifest" href="\/brand\/manifest\.json"/)
    assert.match(out, /<title>Indobase Discuss<\/title>/)
  })
})
