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

const BRAND_JS = `<script id="indobase-meet-brand-js">
(function () {
  var PRODUCT = ${JSON.stringify(PRODUCT)};
  var RE = /\\bJitsi(\\s+Meet)?\\b/gi;
  var SKIP = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEXTAREA:1, CODE:1, PRE:1 };

  function rewriteText(node) {
    if (!node || node.nodeType !== 3) return;
    var p = node.parentElement;
    if (p && SKIP[p.tagName]) return;
    var v = node.nodeValue;
    if (!v || !RE.test(v)) return;
    RE.lastIndex = 0;
    node.nodeValue = v.replace(RE, PRODUCT);
  }

  function walk(root) {
    if (!root) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) rewriteText(n);
  }

  function patchAttrs(el) {
    if (!el || !el.getAttribute) return;
    ["alt","aria-label","title","placeholder"].forEach(function (a) {
      var v = el.getAttribute(a);
      if (v && RE.test(v)) {
        RE.lastIndex = 0;
        el.setAttribute(a, v.replace(RE, PRODUCT));
      }
    });
  }

  function boot() {
    try { document.title = PRODUCT; } catch (_) {}
    walk(document.documentElement);
    document.querySelectorAll("[alt],[aria-label],[title],[placeholder]").forEach(patchAttrs);
    var obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "characterData") rewriteText(m.target);
        else if (m.addedNodes) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (node.nodeType === 3) rewriteText(node);
            else if (node.nodeType === 1) {
              walk(node);
              patchAttrs(node);
              if (node.querySelectorAll) {
                node.querySelectorAll("[alt],[aria-label],[title],[placeholder]").forEach(patchAttrs);
              }
            }
          }
        }
      }
    });
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
</script>`

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
