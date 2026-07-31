/**
 * Brand Mattermost HTML responses as Indobase Discuss.
 * Only rewrite text/html — never touch JS/CSS/JSON (SPA must keep working).
 *
 * Team Edition still ships "Mattermost" inside compiled webapp bundles; we
 * scrub the document shell + inject CSS/JS that hide logos and rewrite safe
 * visible text nodes. See NOTICE.md for residual TE limits.
 */

import { applyDiscussDebranding } from './debrand.js'
import { injectVisualSystem } from './visual-system.js'

const PRODUCT = 'Indobase Discuss'
const TITLE_TAG = `<title>${PRODUCT}</title>`

const FAVICON_LINKS = [
  '<link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="/brand/indobase-favicon-32.png" />',
  '<link rel="icon" type="image/png" sizes="16x16" href="/brand/indobase-favicon-16.png" />',
  '<link rel="apple-touch-icon" href="/brand/indobase-apple-touch.png" />',
].join('')

/** CSS: kill LoadingScreen pills, swap logos, hide upstream marks. */
const BRAND_CSS = `<style id="indobase-discuss-brand-css">
/* Replace Mattermost cold-load screen (giant black SVG pills + compass). */
#initialPageLoadingScreen.LoadingScreen,
.LoadingScreen {
  background: #f8fafc !important;
}
#initialPageLoadingScreen .LoadingScreen__background,
.LoadingScreen .LoadingScreen__background,
#initialPageLoadingScreen svg,
.LoadingScreen > .LoadingScreen__background svg,
#initialPageLoadingAnimation,
.LoadingAnimation {
  display: none !important;
}
#initialPageLoadingScreen::after,
.LoadingScreen.LoadingScreen--darkMode::after,
body > .LoadingScreen::after {
  content: "";
  display: block;
  width: 48px;
  height: 48px;
  margin: 0 auto;
  background: url("/brand/indobase-logo-mark-80.png") center / contain no-repeat;
}
#initialPageLoadingScreen::before,
body > .LoadingScreen::before {
  content: "Opening Indobase Discuss…";
  display: block;
  margin: 0 0 20px;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
  letter-spacing: 0.01em;
}
#initialPageLoadingScreen,
body > .LoadingScreen {
  display: flex !important;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* Sidebar / header Mattermost logos → Indobase mark. */
.SidebarHeaderLogoButton img,
.SidebarHeader .logo-wrapper img,
img.LogoSidebar,
.global-header__logo img,
.HeaderLogo img,
#SidebarContainer .team__header img,
.team__header .team-name-img,
.sidebar-header-logo,
.login-body .logo img,
.signup-header img,
.AboutModal .logo img,
.about-modal .logo img,
.modal .about-modal__logo img,
img[src*="logoMattermost"],
img[src*="logo_white"],
img[src*="/static/images/logo"],
img[alt="Mattermost" i],
img[alt*="Mattermost" i] {
  object-fit: contain !important;
  object-position: left center !important;
  content: url("/brand/indobase-logo-mark-80.png") !important;
  max-height: 28px !important;
  max-width: 120px !important;
  width: auto !important;
  height: 28px !important;
}

/* Custom brand slot (login) — keep compact; Studio SSO owns most login chrome. */
.custom-brand img,
.signup-team-custom-brand img,
img.custom_brand_image {
  max-height: 48px !important;
  max-width: 240px !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain !important;
}

/* Hide download-app / Mattermost.com promo chrome when TE still renders it. */
.AppDownloadLink,
.get-app-modal,
a[href*="mattermost.com/pl/download"],
a[href*="mattermost.com/pl/android"],
a[href*="mattermost.com/pl/ios"] {
  display: none !important;
}
</style>`

/** Early paint + MutationObserver text rewrite for visible chrome. */
const BRAND_JS = `<script id="indobase-discuss-brand-js">
(function () {
  var PRODUCT = ${JSON.stringify(PRODUCT)};
  var RE = /\\bMattermost\\b/gi;
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
    // name/property before content
    out = out.replace(
      new RegExp(
        `(<meta\\b[^>]*\\b(?:name|property)=["']${esc}["'][^>]*\\bcontent=["'])([^"']*)(["'])`,
        'gi'
      ),
      `$1${value}$3`
    )
    // content before name/property
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

/** Rewrite document title, favicon, metas; inject brand CSS/JS; scrub shell strings. */
export function brandDiscussHtml(html: string): string {
  let out = html

  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, TITLE_TAG)
  } else if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}${TITLE_TAG}`)
  }

  // Drop upstream favicon / apple-touch / manifest that still say Mattermost.
  out = out.replace(/<link\b[^>]*\brel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi, '')
  out = out.replace(/<link\b[^>]*\brel=["']manifest["'][^>]*>/gi, '')

  out = replaceMetaContent(out, ['application-name', 'og:site_name', 'apple-mobile-web-app-title'], PRODUCT)

  // Noscript + any remaining shell copy (not inside <script> bodies we leave alone —
  // TE compiled JS still contains the string; CSS/JS injection covers runtime chrome).
  out = out.replace(
    /(<noscript\b[^>]*>)([\s\S]*?)(<\/noscript>)/gi,
    (_m, open, body, close) =>
      `${open}${String(body).replace(/\bMattermost\b/gi, PRODUCT)}${close}`
  )

  // Strip the default LoadingScreen markup so giant pills never paint, even before CSS.
  // Match from #initialPageLoadingScreen through the opening of #root (nested divs inside).
  out = out.replace(
    /<div\b[^>]*\bid=["']initialPageLoadingScreen["'][^>]*>[\s\S]*?(?=<div\b[^>]*\bid=["']root["'])/i,
    `<div id="initialPageLoadingScreen" class="LoadingScreen LoadingScreen--indobase" role="status" aria-live="polite" style="position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;font-family:system-ui,sans-serif;color:#0f172a"><img src="/brand/indobase-logo-mark-80.png" alt="" width="48" height="48" style="display:block;margin:0 0 16px"/><span style="font-weight:600;font-size:15px">Opening Indobase Discuss…</span></div>`
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

  // Debranding lane (edition badges, upstream marks, OG/manifest metadata, AGPL
  // §13 notices link) lives in debrand.ts — see that module for selectors.
  // Visual system (tokens, typography, controls, states) lives in
  // visual-system.ts and is injected last so its <style> is the final child of
  // <head>, ahead of the stylesheets Mattermost appends at runtime.
  return injectVisualSystem(applyDiscussDebranding(out))
}

export function shouldBrandDiscussResponse(contentType: string | null): boolean {
  if (!contentType) return false
  const ct = contentType.toLowerCase()
  return ct.includes('text/html')
}
