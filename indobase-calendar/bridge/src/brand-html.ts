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

const BRAND_JS = `<script id="indobase-calendar-brand-js">
(function () {
  var PRODUCT = ${JSON.stringify(PRODUCT)};
  var PHRASES = [
    [/\\bCal\\.com,\\s*Inc\\.?\\b/gi, 'Indobase'],
    [/\\bCal\\.com\\b/g, PRODUCT],
    [/\\bcal\\.diy\\b/gi, PRODUCT],
    [/\\bCalendly\\b/gi, PRODUCT],
    [/\\bWelcome to Cal\\b/gi, 'Welcome to ' + PRODUCT],
    [/\\bsupport@cal\\.com\\b/gi, 'support@indobase.in'],
    [/\\bPowered by Cal\\b/gi, PRODUCT]
  ];
  var HOST = /(?:^|[/.@])cal\\.(?:com|diy)(?:[/]|$)/i;
  var SKIP = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEXTAREA:1, CODE:1, PRE:1 };

  function applyPhrases(text) {
    if (!text) return text;
    var out = text;
    for (var i = 0; i < PHRASES.length; i++) {
      out = out.replace(PHRASES[i][0], PHRASES[i][1]);
    }
    return out;
  }

  function rewriteText(node) {
    if (!node || node.nodeType !== 3) return;
    var p = node.parentElement;
    if (p && SKIP[p.tagName]) return;
    var v = node.nodeValue;
    if (!v) return;
    var n = applyPhrases(v);
    if (n !== v) node.nodeValue = n;
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
      if (v) {
        var n = applyPhrases(v);
        if (n !== v) el.setAttribute(a, n);
      }
    });
    if (el.tagName === 'A') {
      var href = el.getAttribute('href') || '';
      if (HOST.test(href) || href.indexOf('go.cal.com') !== -1) {
        el.setAttribute('href', '#');
        el.setAttribute('aria-hidden', 'true');
        el.style.display = 'none';
      }
    }
  }

  function scrubCredits() {
    document.querySelectorAll('a[href*="cal.com"], a[href*="cal.diy"], a[href*="go.cal.com"]').forEach(function (a) {
      a.setAttribute('href', '#');
      a.style.display = 'none';
      a.setAttribute('aria-hidden', 'true');
      var sm = a.closest('small');
      if (sm && sm.textContent && /cal\\.com|go\\.cal/i.test(sm.textContent)) sm.style.display = 'none';
    });
  }

  function mountMeetChip(meet) {
    if (!meet || !meet.enabled || !meet.meetLink) return;
    if (document.getElementById('indobase-meet-attach-chip')) return;
    var bar = document.createElement('div');
    bar.id = 'indobase-meet-attach-chip';
    bar.setAttribute(
      'style',
      'position:fixed;z-index:2147483000;right:16px;bottom:16px;max-width:min(420px,92vw);' +
        'background:#0f172a;color:#f8fafc;border-radius:12px;padding:12px 14px;' +
        'box-shadow:0 10px 30px rgba(15,23,42,.28);font:13px/1.4 system-ui,sans-serif'
    );
    var title = document.createElement('div');
    title.textContent = 'Meet room linked';
    title.setAttribute('style', 'font-weight:600;margin:0 0 4px;color:#3B8FD6');
    var id = document.createElement('div');
    id.textContent = meet.meetingId || '';
    id.setAttribute('style', 'font-size:11px;opacity:.8;word-break:break-all;margin:0 0 8px');
    var row = document.createElement('div');
    row.setAttribute('style', 'display:flex;gap:8px;flex-wrap:wrap');
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy invite';
    copy.setAttribute(
      'style',
      'border:0;border-radius:8px;padding:8px 12px;background:#1e293b;color:#fff;cursor:pointer;font-weight:600'
    );
    copy.onclick = function () {
      try {
        navigator.clipboard.writeText(meet.meetLink);
        copy.textContent = 'Copied';
        setTimeout(function () { copy.textContent = 'Copy invite'; }, 1200);
      } catch (_) {}
    };
    var open = document.createElement('a');
    open.href = meet.launchUrl || meet.meetLink;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = 'Open Meet';
    open.setAttribute(
      'style',
      'border-radius:8px;padding:8px 12px;background:#3B8FD6;color:#fff;text-decoration:none;font-weight:600'
    );
    row.appendChild(copy);
    row.appendChild(open);
    bar.appendChild(title);
    bar.appendChild(id);
    bar.appendChild(row);
    document.body.appendChild(bar);
  }

  function boot() {
    try { document.title = PRODUCT; } catch (_) {}
    walk(document.documentElement);
    document.querySelectorAll("[alt],[aria-label],[title],[placeholder],a[href]").forEach(patchAttrs);
    scrubCredits();
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
                node.querySelectorAll("[alt],[aria-label],[title],[placeholder],a[href]").forEach(patchAttrs);
              }
            }
          }
        }
        scrubCredits();
      }
    });
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    fetch('/api/meet', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        if (body && body.meet) mountMeetChip(body.meet);
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
</script>`

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
