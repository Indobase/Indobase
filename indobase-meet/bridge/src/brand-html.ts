/**
 * Brand Meet engine HTML as Indobase Meet.
 * Only rewrite text/html — never touch JS/CSS/JSON (SPA must keep working).
 */

const PRODUCT = 'Indobase Meet'
const TITLE_TAG = `<title>${PRODUCT}</title>`

const FAVICON_LINKS = [
  '<link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="/brand/indobase-favicon-32.png" />',
  '<link rel="icon" type="image/png" sizes="16x16" href="/brand/indobase-favicon-16.png" />',
  '<link rel="apple-touch-icon" href="/brand/indobase-apple-touch.png" />',
].join('')

const BRAND_CSS = `<style id="indobase-meet-brand-css">
:root { --indobase-brand: #3B8FD6; }
/* Hide engine watermarks / powered-by when CE still paints them */
.leftwatermark, .rightwatermark,
.watermark, .poweredby,
a[href*="jitsi.org"],
a[href*="8x8.vc"] {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
}
/* Splash / welcome */
.welcome .header .logo,
.prejoin-full-page .logo,
#welcome_page .header .logo {
  content: url("/brand/indobase-logo-mark-80.png") !important;
  max-height: 48px !important;
  width: auto !important;
}
</style>`

/**
 * Brand layer for Indobase Meet, loaded EXTERNALLY on purpose.
 *
 * An inline <script> is refused by any upstream `script-src 'self'` CSP meta tag, and fails
 * SILENTLY — the rebrand simply never applies and nothing reports it. Discuss shipped that
 * way. /brand/* is bridge-served, so this form works with or without a CSP.
 */
const BRAND_JS = `<script src="/brand/meet-brand.js" defer></script>`

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

export function brandMeetHtml(html: string): string {
  let out = html

  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, TITLE_TAG)
  } else if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}${TITLE_TAG}`)
  }

  out = out.replace(/<link\b[^>]*\brel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi, '')
  out = out.replace(/<link\b[^>]*\brel=["']manifest["'][^>]*>/gi, '')

  out = replaceMetaContent(out, ['application-name', 'og:site_name', 'apple-mobile-web-app-title'], PRODUCT)

  out = out.replace(
    /(<noscript\b[^>]*>)([\s\S]*?)(<\/noscript>)/gi,
    (_m, open, body, close) =>
      `${open}${String(body).replace(/\bJitsi(\s+Meet)?\b/gi, PRODUCT)}${close}`
  )

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

export function shouldBrandMeetResponse(contentType: string | null): boolean {
  if (!contentType) return false
  return contentType.toLowerCase().includes('text/html')
}
