/**
 * Debranding chrome for Indobase Discuss (spec sections 1 + 2).
 *
 * Everything here is additive to `brand-html.ts`: a CSS block that hides the
 * upstream edition badges / wordmarks / build fingerprints, document metadata
 * (OG + manifest + theme colour) and the AGPL §13 "open source notices" surface.
 *
 * Rules of the road (see AGENTS notes / NOTICE.md):
 *  - text/html responses only; never rewrite JS, CSS, JSON or binaries.
 *  - selectors are anchored on hardcoded ids, plain SCSS class names or
 *    data-testid attributes — never on styled-components hashes, which move on
 *    every Mattermost upgrade.
 *  - nothing interactive is hidden. Where a Mattermost destination is removed we
 *    either replace it (Indobase link) or the item was purely informational.
 *  - the AGPL attribution in the About modal (`.about-modal__copyright`,
 *    `.about-modal__notice`) is deliberately left visible and must NOT be text
 *    rewritten — falsifying an upstream copyright line is not debranding.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRODUCT = 'Indobase Discuss'
const DESCRIPTION = 'Team chat for your Indobase organization and project'
const THEME_COLOR = '#2585e6'
const OG_IMAGE_PATH = '/brand/indobase-logo-mark.png'

/** Bridge-owned routes (served by index.ts, allowed by `script-src 'self'`). */
export const NOTICES_PATH = '/brand/notices'
export const DEBRAND_SCRIPT_PATH = '/brand/discuss-debrand.js'
export const MANIFEST_PATH = '/brand/manifest.json'
export const NOTICES_LABEL = 'Open source notices'

/**
 * CSS-only debranding. Loaded last in <head> so it wins ties against the
 * brand-html block, and it survives even when injected JS is blocked by
 * Mattermost's `<meta http-equiv="Content-Security-Policy">`.
 */
export const DEBRAND_CSS = `<style id="indobase-discuss-debrand-css">
/* ── Global header: wordmark + "FREE EDITION" badge ────────────────────────
   Unlicensed servers render <ProductBrandingTeamEdition> (inline <svg> wordmark
   + FREE EDITION badge) as the sibling that follows the product switch button.
   #product_switch_menu is a hardcoded id. The rule is scoped to non-interactive
   siblings so anything clickable upstream adds later stays reachable. */
#product_switch_menu ~ *:not(a):not(button):not(input):not([role="button"]):not([role="menu"]) {
  display: none !important;
}

/* ── Product menu footer: "FREE EDITION — free unsupported edition of …" ──
   Purely informational (id + class are hardcoded, not hashed). */
#startTrial,
li.MenuStartTrial,
.MenuStartTrial {
  display: none !important;
}

/* ── Help (?) menu: upstream destinations ─────────────────────────────────
   docs.mattermost.com user guide + academy.mattermost.com training are
   hardcoded in the webapp (no config key). Ask-the-community and
   report-a-problem are also switched off in bootstrap config; these rules are
   defence in depth for volumes whose config predates that patch.
   #keyboardShortcuts is deliberately left alone. */
#mattermostUserGuideLink,
#trainingResourcesLink,
#askTheCommunityLink,
#reportAProblemLink {
  display: none !important;
}

/* ── App Marketplace entry (Mattermost plugin store) ──────────────────────
   Also disabled server-side via PluginSettings.EnableMarketplace. */
#marketplaceModal {
  display: none !important;
}

/* ── About modal ──────────────────────────────────────────────────────────
   Hide the upstream mark, the version/build fingerprints and the
   mattermost.com community CTA. Copyright + open-source notice stay visible:
   that is the AGPL attribution (NOTICE.md) and must not be hidden or rewritten. */
.about-modal__logo,
.about-modal__hash,
[data-testid="aboutModalVersion"],
[data-testid="aboutModalDBVersionString"] {
  display: none !important;
}
.about-modal__footer a[href*="mattermost.com"] {
  display: none !important;
}
/* :has() is Baseline-2023; browsers that lack it simply drop this one rule. */
.about-modal__footer p:has(> a[href*="mattermost.com"]) {
  display: none !important;
}
/* The heading is literally "<strong>Mattermost</strong> Team Edition" with no
   config key behind it, and the text-node rewrite can be blocked by the
   upstream CSP — so substitute the visible string in CSS. Selectable text still
   reads upstream; that is a known residual (NOTICE.md). */
.about-modal__title {
  position: relative;
}
.about-modal__title,
.about-modal__title * {
  color: transparent !important;
}
.about-modal__title::after {
  content: "${PRODUCT}";
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  color: var(--center-channel-color, #0f172a);
}

/* ── Header/footer route shell (/error, /terms_of_service, /mfa, …) ───────
   Renders the wordmark SVG + a FREE EDITION badge next to the (branded) site
   name. Plain class names, not hashed. */
.hfroute-header .freeBadge,
.hfroute-header a.header-logo-link > svg {
  display: none !important;
}

/* ── Residual upstream promos ─────────────────────────────────────────────
   mattermost.com permalinks that survive elsewhere in chrome. Attribution
   links inside the About modal notice are matched by href only on the footer
   rule above, so they stay intact here. */
a[href*="mattermost.com/pl/"] {
  display: none !important;
}

/* ── :mattermost: custom emoji tile ───────────────────────────────────────
   FRAGILE-ish: data-testid carries the emoji short name; the custom-emoji
   render path differs from the sprite path, so verify after upgrades. Hiding a
   single picker tile strands nobody (autocomplete is a separate surface). */
.emoji-picker__item[data-testid~="mattermost"] {
  display: none !important;
}
</style>`

/**
 * External brand script. Inline <script> is refused by Mattermost's document
 * CSP (`script-src 'self' cdn.rudderlabs.com/`), so this is served from a
 * bridge route and loaded with `defer` — same origin, allowed by 'self'.
 *
 * Scope is intentionally narrow: mount the AGPL §13 "open source notices" link.
 * Visible-text rewriting stays in brand-html.ts so the two never fight.
 */
export const DEBRAND_JS = `(function () {
  "use strict";
  var HREF = ${JSON.stringify(NOTICES_PATH)};
  var LABEL = ${JSON.stringify(NOTICES_LABEL)};
  var MARK = "indobase-open-source-notices";
  var CALL_MARK = "indobase-start-call";

  function makeLink(style) {
    var a = document.createElement("a");
    a.className = MARK;
    a.href = HREF;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = LABEL;
    a.setAttribute("style", style);
    return a;
  }

  function mountProductMenu() {
    var menu = document.getElementById("product-switcher-menu");
    if (!menu || menu.querySelector("." + MARK)) return;
    var list = menu.querySelector("ul") || menu;
    var item = document.createElement("li");
    item.setAttribute("role", "none");
    item.className = MARK + "-item";
    item.setAttribute("style", "list-style:none");
    var link = makeLink(
      "display:block;padding:8px 20px;font-size:12px;line-height:16px;color:inherit;opacity:.72;text-decoration:none"
    );
    link.setAttribute("role", "menuitem");
    item.appendChild(link);
    list.appendChild(item);
  }

  function mountAboutModal() {
    var modal = document.querySelector(".about-modal");
    if (!modal || modal.querySelector("." + MARK)) return;
    var host =
      modal.querySelector(".about-modal__notice") ||
      modal.querySelector(".about-modal__footer") ||
      modal.querySelector(".modal-body") ||
      modal;
    var block = document.createElement("div");
    block.className = MARK + "-block";
    block.setAttribute("style", "margin-top:8px;font-size:12px");
    block.appendChild(makeLink("color:inherit;text-decoration:underline"));
    host.appendChild(block);
  }

  function currentChannelId() {
    try {
      var path = location.pathname || "";
      // /team/channels/name or /team/messages/@user
      var m = path.match(/\\/channels\\/([^/]+)/);
      if (m && m[1]) return decodeURIComponent(m[1]);
      var el =
        document.getElementById("channelHeaderTitle") ||
        document.querySelector("[data-testid='channelHeaderTitle']") ||
        document.querySelector(".channel-header");
      var id = el && (el.getAttribute("data-channelid") || el.getAttribute("data-channel-id"));
      return id || "";
    } catch (e) {
      return "";
    }
  }

  function mountStartCall() {
    if (document.querySelector("." + CALL_MARK)) return;
    var host =
      document.querySelector("#channel-header") ||
      document.querySelector(".ChannelHeader") ||
      document.querySelector(".channel-header") ||
      document.querySelector("#channelHeaderInfo") ||
      document.querySelector("[data-testid='channel_view_header']");
    if (!host) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = CALL_MARK;
    btn.textContent = "Start call";
    btn.title = "Start an Indobase Meet call";
    btn.setAttribute(
      "style",
      "margin-left:8px;border:0;border-radius:8px;padding:6px 12px;background:#3B8FD6;color:#fff;" +
        "font:600 12px/1.2 system-ui,sans-serif;cursor:pointer;white-space:nowrap"
    );
    btn.addEventListener("click", function () {
      if (btn.disabled) return;
      btn.disabled = true;
      var prev = btn.textContent;
      btn.textContent = "Opening…";
      var q = currentChannelId()
        ? "?channel_id=" + encodeURIComponent(currentChannelId())
        : "";
      fetch("/api/meet/start" + q, { credentials: "same-origin" })
        .then(function (r) {
          return r.json().then(function (body) {
            return { ok: r.ok, body: body };
          });
        })
        .then(function (res) {
          if (!res.ok || !res.body || !res.body.launchUrl) {
            throw new Error((res.body && res.body.note) || "Meet is not ready");
          }
          window.open(res.body.launchUrl, "_blank", "noopener,noreferrer");
        })
        .catch(function () {
          btn.textContent = "Unavailable";
          setTimeout(function () {
            btn.textContent = prev;
            btn.disabled = false;
          }, 1600);
          return;
        })
        .then(function () {
          btn.textContent = prev;
          btn.disabled = false;
        });
    });

    // Prefer placing next to channel title / header buttons.
    var title =
      host.querySelector("#channelHeaderTitle") ||
      host.querySelector("[data-testid='channelHeaderTitle']") ||
      host.querySelector(".channel-header__info") ||
      host;
    title.appendChild(btn);
  }

  function mount() {
    try { mountProductMenu(); } catch (e) { /* never break the app */ }
    try { mountAboutModal(); } catch (e) { /* never break the app */ }
    try { mountStartCall(); } catch (e) { /* never break the app */ }
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    var run = function () {
      queued = false;
      mount();
    };
    // Bound calls only — a detached requestAnimationFrame throws in Chrome.
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  function boot() {
    mount();
    try {
      new MutationObserver(schedule).observe(document.documentElement, {
        subtree: true,
        childList: true,
      });
    } catch (e) { /* observer unsupported — link still lives at ${NOTICES_PATH} */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
`

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** True when the document already carries `<meta name|property="key">`. */
export function hasMeta(html: string, kind: 'name' | 'property', key: string): boolean {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<meta\\b[^>]*\\b${kind}=["']${esc}["']`, 'i').test(html)
}

function hasLinkRel(html: string, rel: string): boolean {
  return new RegExp(`<link\\b[^>]*\\brel=["']${rel}["']`, 'i').test(html)
}

function insertIntoHead(html: string, tags: string): string {
  if (!tags) return html
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tags}</head>`)
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}${tags}`)
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (m) => `${m}${tags}`)
  return `${tags}${html}`
}

/** Absolute public origin for OG tags; '' when not configured (relative URLs). */
export function resolvePublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.DISCUSS_PUBLIC_URL || env.DISCUSS_SITE_URL || ''
  const trimmed = raw.trim().replace(/\/+$/, '')
  return /^https?:\/\/[^\s"'<>]+$/i.test(trimmed) ? trimmed : ''
}

/**
 * Insert (never clobber) the document metadata Mattermost's shell omits:
 * description, theme-color and the OpenGraph/Twitter set used by link unfurls.
 * Existing tags are left as-is — brand-html.ts already rewrites the ones
 * upstream emits.
 */
export function debrandDocumentMeta(html: string, baseUrl = ''): string {
  const abs = (p: string) => (baseUrl ? `${baseUrl}${p}` : p)
  const image = abs(OG_IMAGE_PATH)

  const wanted: Array<{ kind: 'name' | 'property'; key: string; content: string }> = [
    { kind: 'name', key: 'description', content: DESCRIPTION },
    { kind: 'name', key: 'theme-color', content: THEME_COLOR },
    { kind: 'property', key: 'og:site_name', content: PRODUCT },
    { kind: 'property', key: 'og:title', content: PRODUCT },
    { kind: 'property', key: 'og:type', content: 'website' },
    { kind: 'property', key: 'og:description', content: DESCRIPTION },
    { kind: 'property', key: 'og:image', content: image },
    { kind: 'name', key: 'twitter:card', content: 'summary' },
    { kind: 'name', key: 'twitter:title', content: PRODUCT },
    { kind: 'name', key: 'twitter:description', content: DESCRIPTION },
    { kind: 'name', key: 'twitter:image', content: image },
  ]
  if (baseUrl) wanted.push({ kind: 'property', key: 'og:url', content: baseUrl })

  const tags = wanted
    .filter((m) => !hasMeta(html, m.kind, m.key))
    .map((m) => `<meta ${m.kind}="${m.key}" content="${escapeAttr(m.content)}" />`)

  // brand-html strips Mattermost's manifest link; ship ours in its place so
  // Add-to-Home-Screen / PWA install keeps working with Indobase icons.
  if (!hasLinkRel(html, 'manifest')) {
    tags.push(`<link rel="manifest" href="${MANIFEST_PATH}" />`)
  }
  // Machine-readable pointer at the AGPL §13 notices page.
  if (!hasLinkRel(html, 'license')) {
    tags.push(`<link rel="license" href="${NOTICES_PATH}" />`)
  }

  return insertIntoHead(html, tags.join(''))
}

/** Document shells only — never fragments (API HTML, error snippets). */
function looksLikeDocument(html: string): boolean {
  return /<head\b|<\/head>|<html\b|<body\b/i.test(html)
}

/**
 * Single entry point wired into `brandDiscussHtml`: metadata + debrand CSS +
 * the external (CSP-safe) brand script.
 */
export function applyDiscussDebranding(html: string, baseUrl = resolvePublicBaseUrl()): string {
  if (!looksLikeDocument(html)) return html
  if (html.includes('indobase-discuss-debrand-css')) return html
  const withMeta = debrandDocumentMeta(html, baseUrl)
  return insertIntoHead(
    withMeta,
    `${DEBRAND_CSS}<script src="${DEBRAND_SCRIPT_PATH}" defer></script>`
  )
}

// ── AGPL §13: open source notices ────────────────────────────────────────────

/** Last-resort notice text if no NOTICE.md ships with the deployment. */
const FALLBACK_NOTICE = [
  '# Third-party attribution',
  '',
  'Indobase Discuss is built on [Mattermost](https://github.com/mattermost/mattermost)',
  '(Team Edition), licensed under **AGPL-3.0**. We run the official Mattermost',
  'container image unmodified; the complete corresponding source is available from',
  'the upstream project.',
  '',
  'Questions about this notice: support@indobase.in',
].join('\n')

const NOTICE_CANDIDATES = (dir: string): string[] => [
  path.resolve(dir, '../../NOTICE.md'), // repo root (dev / monorepo checkout)
  path.resolve(dir, '../NOTICE.md'),
  path.resolve(dir, '../public/brand/notices.md'), // shipped copy (container)
  path.resolve(dir, '../../public/brand/notices.md'),
]

let cachedNotice: string | null = null

/**
 * Read NOTICE.md from disk (env override first), falling back to the embedded
 * copy. The result is cached for the default reader only, so tests can inject.
 */
export function loadNoticeMarkdown(readFile?: (p: string) => string): string {
  const useCache = readFile === undefined
  if (useCache && cachedNotice !== null) return cachedNotice
  const read = readFile ?? ((p: string) => readFileSync(p, 'utf8'))
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [process.env.DISCUSS_NOTICE_FILE, ...NOTICE_CANDIDATES(here)].filter(
    (p): p is string => Boolean(p)
  )
  for (const candidate of candidates) {
    try {
      const text = read(candidate)
      if (text && text.trim()) {
        if (useCache) cachedNotice = text
        return text
      }
    } catch {
      /* try the next candidate */
    }
  }
  if (useCache) cachedNotice = FALLBACK_NOTICE
  return FALLBACK_NOTICE
}

function safeHref(raw: string): string | null {
  const url = raw.trim()
  if (/^https?:\/\//i.test(url)) return url
  if (/^mailto:/i.test(url)) return url
  if (url.startsWith('/') && !url.startsWith('//')) return url
  return null
}

function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, href: string) => {
      const safe = safeHref(href)
      if (!safe) return text
      return `<a href="${safe}" rel="noopener noreferrer">${text}</a>`
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

/**
 * Minimal, escaping-first Markdown renderer for the notices page.
 * Supports headings, paragraphs, unordered lists, tables-as-text, links, bold
 * and code spans — everything else is emitted as escaped text.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let inList = false

  const flushParagraph = () => {
    if (!paragraph.length) return
    out.push(`<p>${renderInline(escapeHtml(paragraph.join(' ')))}</p>`)
    paragraph = []
  }
  const closeList = () => {
    if (!inList) return
    out.push('</ul>')
    inList = false
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      closeList()
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      closeList()
      const level = Math.min(heading[1].length + 1, 6)
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`)
      continue
    }
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed)
    if (bullet) {
      flushParagraph()
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${renderInline(escapeHtml(bullet[1]))}</li>`)
      continue
    }
    closeList()
    paragraph.push(trimmed)
  }
  flushParagraph()
  closeList()
  return out.join('\n')
}

/**
 * AGPL §13 compliance page. The source offer is generated here (not read from
 * NOTICE.md) so it is present even if the markdown copy is missing; the
 * NOTICE.md body follows as attribution detail.
 */
export function renderNoticesPage(markdown: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${NOTICES_LABEL} — ${PRODUCT}</title>
<link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />
<style>
:root { color-scheme: light dark; --ink:#0f172a; --muted:#475569; --border:#e2e8f0; --bg:#f8fafc; --card:#fff; --link:#2563eb; }
@media (prefers-color-scheme: dark) {
  :root { --ink:#e2e8f0; --muted:#94a3b8; --border:#1e293b; --bg:#0b1220; --card:#0f172a; --link:#60a5fa; }
}
body { margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,-apple-system,"Segoe UI",sans-serif; line-height:1.55; }
main { max-width:44rem; margin:0 auto; padding:40px 20px 64px; }
.card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:24px 28px; }
h1 { font-size:22px; margin:0 0 4px; }
h2 { font-size:16px; margin:28px 0 8px; }
h3 { font-size:14px; margin:20px 0 6px; }
p, li { font-size:14px; color:var(--muted); }
li { margin:4px 0; }
ul { padding-left:20px; }
a { color:var(--link); }
code { background:rgba(148,163,184,.18); padding:1px 5px; border-radius:4px; font-size:13px; }
hr { border:none; border-top:1px solid var(--border); margin:28px 0; }
.brand { display:flex; align-items:center; gap:10px; margin-bottom:24px; }
.brand span { font-weight:600; font-size:15px; color:var(--ink); }
.back { display:inline-block; margin-top:24px; font-size:13px; }
</style>
</head>
<body>
<main>
  <div class="brand"><img src="/brand/indobase-logo-mark-80.png" alt="" width="28" height="28" /><span>${PRODUCT}</span></div>
  <div class="card">
    <h1>${NOTICES_LABEL}</h1>
    <p>Free and open source software used by ${PRODUCT}, and where to get its source code.</p>
    <h2>Source offer</h2>
    <p>
      ${PRODUCT} runs <a href="https://github.com/mattermost/mattermost" rel="noopener noreferrer">Mattermost</a>
      Team Edition, licensed under the
      <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener noreferrer">GNU Affero General Public License, version 3</a>.
      We deploy the official container image <strong>unmodified</strong>, so the complete corresponding
      source for the server and web application you are interacting with is the upstream release of the
      same version, published at
      <a href="https://github.com/mattermost/mattermost/releases" rel="noopener noreferrer">github.com/mattermost/mattermost/releases</a>
      under the terms of the AGPL.
    </p>
    <p>
      If you would rather receive the corresponding source another way, write to
      <a href="mailto:support@indobase.in">support@indobase.in</a> and we will provide it.
    </p>
    <hr />
    ${markdownToHtml(markdown)}
  </div>
  <a class="back" href="/">← Back to ${PRODUCT}</a>
</main>
</body>
</html>`
}
