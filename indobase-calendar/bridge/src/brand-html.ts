/**
 * Brand scheduling-app HTML responses as Indobase Calendar.
 * Only rewrite text/html — never touch JS/CSS/JSON bundles (SPA must keep working).
 *
 * Community Edition still ships upstream strings inside compiled Next.js payloads;
 * we scrub the document shell, inline styles, and inject CSS/JS for runtime chrome.
 * See NOTICE.md for residual CE limits.
 */

const PRODUCT = 'Indobase Calendar'
const TITLE_TAG = `<title>${PRODUCT}</title>`
const BRAND = '#3B8FD6'

const FAVICON_LINKS = [
  '<link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="/brand/indobase-favicon-32.png" />',
  '<link rel="icon" type="image/png" sizes="16x16" href="/brand/indobase-favicon-16.png" />',
  '<link rel="apple-touch-icon" href="/brand/indobase-apple-touch.png" />',
].join('')

/** Visible copy replacements (shell + runtime text nodes). */
const BRAND_PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bCal\.com,\s*Inc\.?\b/gi, 'Indobase'],
  [/\bCal\.com\b/g, PRODUCT],
  [/\bcal\.diy\b/gi, PRODUCT],
  [/\bCalendly\b/gi, PRODUCT],
  [/\bWelcome to Cal\b/gi, `Welcome to ${PRODUCT}`],
  [/\bsupport@cal\.com\b/gi, 'support@indobase.in'],
  [/\bPowered by Cal\b/gi, PRODUCT],
]

const UPSTREAM_HOST_RE = /(?:^|[/.@])cal\.(?:com|diy)(?:[/]|$)/i

const BRAND_CSS = `<style id="indobase-calendar-brand-css">
:root {
  --indobase-brand: ${BRAND};
  --font-cal: Inter, system-ui, -apple-system, Segoe UI, sans-serif !important;
}
/* Cold-load / splash */
body > #__next > .animate-pulse,
[data-testid="skeleton-loader"],
.cal-loader {
  background: #f8fafc !important;
}
/* Logo swaps */
img[alt*="Cal" i],
img[src*="cal-logo"],
img[src*="calcom"],
a[href="/"] img,
header img[src*="logo"],
aside header img {
  object-fit: contain !important;
  content: url("/brand/indobase-logo-mark-80.png") !important;
  max-height: 28px !important;
  max-width: 120px !important;
}
/* Hide upstream credits / signup / powered-by chrome */
a[href*="cal.com"],
a[href*="cal.diy"],
a[href*="go.cal.com"],
[data-testid="powered-by"],
.powered-by-cal,
aside small:has(a[href*="cal.com"]),
aside small:has(a[href*="go.cal.com"]) {
  display: none !important;
  visibility: hidden !important;
}
</style>`

/**
 * Brand layer for Indobase Calendar, loaded EXTERNALLY on purpose.
 *
 * An inline <script> is refused by any upstream `script-src 'self'` CSP meta tag, and fails
 * SILENTLY — the rebrand simply never applies and nothing reports it. Discuss shipped that
 * way. /brand/* is bridge-served, so this form works with or without a CSP.
 */
const BRAND_JS = `<script src="/brand/calendar-brand.js" defer></script>`

const RAW_TEXT_ELEMENTS = new Set(['script', 'style'])

function applyBrandPhrases(text: string): string {
  if (!text) return text
  let out = text
  for (const [pattern, replacement] of BRAND_PHRASES) {
    out = out.replace(pattern, replacement)
  }
  return out
}

function replaceMetaContent(html: string, names: string[], value: string): string {
  let out = html
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(
      new RegExp(
        `(<meta\\b[^>]*\\b(?:name|property)=["']${esc}["'][^>]*\\bcontent=["'])([^"']*)(["'])`,
        'gi'
      ),
      `$1${value}$3`
    )
    out = out.replace(
      new RegExp(
        `(<meta\\b[^>]*\\bcontent=["'])([^"']*)(["'][^>]*\\b(?:name|property)=["']${esc}["'])`,
        'gi'
      ),
      (_, a, _c, c) => `${a}${value}${c}`
    )
  }
  return out
}

type TagInfo = { name: string; closing: boolean }

function readTagName(html: string, lt: number): TagInfo | null {
  let i = lt + 1
  let closing = false
  if (html[i] === '/') {
    closing = true
    i += 1
  }
  const start = i
  while (i < html.length && /[a-zA-Z0-9:_-]/.test(html[i]!)) i += 1
  if (i === start) return null
  return { name: html.slice(start, i).toLowerCase(), closing }
}

function findTagEnd(html: string, lt: number): number {
  let quote = ''
  for (let i = lt + 1; i < html.length; i += 1) {
    const ch = html[i]!
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') return i + 1
  }
  return html.length
}

function findCloseTag(html: string, name: string, from: number): { start: number; end: number } | null {
  const needle = `</${name}`
  const lower = html.toLowerCase()
  const start = lower.indexOf(needle, from)
  if (start === -1) return null
  return { start, end: findTagEnd(html, start) }
}

function neutralizeUpstreamHref(tag: string): string {
  return tag.replace(
    /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (whole, d?: string, s?: string) => {
      const href = d ?? s ?? ''
      if (!UPSTREAM_HOST_RE.test(href) && !/go\.cal\.com/i.test(href)) return whole
      return whole.startsWith("href='") ? "href='#'" : 'href="#"'
    }
  )
}

function rewriteOpenTag(tag: string, name: string): string {
  let out = tag
  if (name === 'a') out = neutralizeUpstreamHref(out)
  if (name === 'style') {
    out = out.replace(/calFont/gi, 'Inter')
    out = out.replace(/CalSans/gi, 'Inter')
    out = out.replace(/--font-cal\s*:\s*[^;]+/gi, '--font-cal: Inter, system-ui, sans-serif')
  }
  return out
}

/** Rewrite visible markup outside script/style bodies. */
export function scrubCalendarShell(html: string): string {
  if (!html) return html

  const out: string[] = []
  let titleDone = false
  let i = 0

  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      out.push(applyBrandPhrases(html.slice(i)))
      break
    }
    if (lt > i) out.push(applyBrandPhrases(html.slice(i, lt)))

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      const stop = end === -1 ? html.length : end + 3
      out.push(html.slice(lt, stop))
      i = stop
      continue
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const stop = findTagEnd(html, lt)
      out.push(html.slice(lt, stop))
      i = stop
      continue
    }

    const info = readTagName(html, lt)
    if (!info) {
      out.push('<')
      i = lt + 1
      continue
    }

    const tagEnd = findTagEnd(html, lt)
    const rawTag = html.slice(lt, tagEnd)

    if (!info.closing && RAW_TEXT_ELEMENTS.has(info.name) && !rawTag.trimEnd().endsWith('/>')) {
      const close = findCloseTag(html, info.name, tagEnd)
      const stop = close ? close.end : html.length
      if (info.name === 'style') {
        const inner = html.slice(tagEnd, close?.start ?? html.length)
        out.push(
          rawTag,
          inner.replace(/calFont/gi, 'Inter').replace(/CalSans/gi, 'Inter').replace(
            /--font-cal\s*:\s*[^;]+/gi,
            '--font-cal: Inter, system-ui, sans-serif'
          ),
          close ? html.slice(close.start, close.end) : ''
        )
      } else {
        out.push(html.slice(lt, stop))
      }
      i = stop
      continue
    }

    if (!info.closing && info.name === 'title' && !titleDone) {
      const close = findCloseTag(html, 'title', tagEnd)
      out.push(rawTag, PRODUCT, close ? html.slice(close.start, close.end) : '</title>')
      titleDone = true
      i = close ? close.end : html.length
      continue
    }

    out.push(info.closing ? rawTag : rewriteOpenTag(rawTag, info.name))
    i = tagEnd
  }

  return out.join('')
}

export function shouldBrandCalendarResponse(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  return contentType.toLowerCase().includes('text/html')
}

export function brandCalendarHtml(html: string): string {
  let out = html

  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, TITLE_TAG)
  } else if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}${TITLE_TAG}`)
  }

  out = out.replace(/<link\b[^>]*\brel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi, '')
  out = out.replace(/<link\b[^>]*\brel=["']manifest["'][^>]*>/gi, '')

  out = replaceMetaContent(
    out,
    ['application-name', 'og:site_name', 'og:title', 'apple-mobile-web-app-title'],
    PRODUCT
  )

  out = out.replace(
    /(<noscript\b[^>]*>)([\s\S]*?)(<\/noscript>)/gi,
    (_m, open, body, close) => `${open}${applyBrandPhrases(String(body))}${close}`
  )

  out = scrubCalendarShell(out)

  if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}${FAVICON_LINKS}${BRAND_CSS}`)
  }

  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${BRAND_JS}</body>`)
  } else if (/<\/html>/i.test(out)) {
    out = out.replace(/<\/html>/i, `${BRAND_JS}</html>`)
  } else {
    out += BRAND_JS
  }

  return out
}
