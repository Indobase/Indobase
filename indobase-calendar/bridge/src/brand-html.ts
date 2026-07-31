/**
 * Brand scheduling-app HTML responses as Indobase Calendar.
 * Only rewrite text/html — never touch JS/CSS/JSON (SPA must keep working).
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

const BRAND_CSS = `<style id="indobase-calendar-brand-css">
:root {
  --indobase-brand: ${BRAND};
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
header img[src*="logo"] {
  object-fit: contain !important;
  content: url("/brand/indobase-logo-mark-80.png") !important;
  max-height: 28px !important;
  max-width: 120px !important;
}
/* Hide residual powered-by / signup chrome when present */
a[href*="cal.com"],
a[href*="cal.diy"],
[data-testid="powered-by"],
.powered-by-cal {
  display: none !important;
}
</style>`

const BRAND_JS = `<script id="indobase-calendar-brand-js">
(function () {
  try {
    document.title = ${JSON.stringify(PRODUCT)};
    var walk = function (node) {
      if (!node) return;
      if (node.nodeType === 3) {
        var t = node.nodeValue;
        if (!t) return;
        var n = t
          .replace(/\\bCal\\.com\\b/gi, 'Indobase Calendar')
          .replace(/\\bcal\\.diy\\b/gi, 'Indobase Calendar')
          .replace(/\\bCal.com\\b/g, 'Indobase Calendar')
          .replace(/\\bCalendly\\b/gi, 'Indobase Calendar');
        if (n !== t) node.nodeValue = n;
        return;
      }
      if (node.nodeType === 1) {
        var tag = (node.tagName || '').toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') return;
        for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
      }
    };
    walk(document.body);
  } catch (_) {}
})();
</script>`

const UPSTREAM_NAME_RE = /\b(Cal\.com|cal\.diy|Calendly|Calcom)\b/gi

export function shouldBrandCalendarResponse(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  return contentType.toLowerCase().includes('text/html')
}

export function brandCalendarHtml(html: string): string {
  let out = html

  out = out.replace(/<title>[^<]*<\/title>/i, TITLE_TAG)
  if (!/<title>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>${TITLE_TAG}`)
  }

  out = out.replace(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/gi, '')
  out = out.replace(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/gi, '')
  out = out.replace(/<head([^>]*)>/i, `<head$1>${FAVICON_LINKS}`)

  if (!out.includes('indobase-calendar-brand-css')) {
    out = out.replace(/<\/head>/i, `${BRAND_CSS}</head>`)
  }
  if (!out.includes('indobase-calendar-brand-js')) {
    out = out.replace(/<\/body>/i, `${BRAND_JS}</body>`)
  }

  // Soft scrub of title-adjacent meta / og tags only (not script bodies)
  out = out.replace(
    /(<meta[^>]+(?:property|name)=["'](?:og:title|application-name|apple-mobile-web-app-title)["'][^>]+content=["'])([^"']*)(["'])/gi,
    (_m, a, _v, c) => `${a}${PRODUCT}${c}`
  )

  // Visible fallback: replace common engine strings outside script/style via crude pass on title already done
  if (UPSTREAM_NAME_RE.test(out.slice(0, 2000))) {
    UPSTREAM_NAME_RE.lastIndex = 0
  }

  return out
}
