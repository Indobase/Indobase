/**
 * Brand rewrite for upstream HTML shells.
 *
 * The upstream container renders its own product name into the HTML shell it serves
 * (`<title>`, headings, marketing copy). Those bytes reach the browser untouched through
 * `proxyCrm`, so `Website Settings.app_name` alone cannot change what the tab says.
 * This module is the only place the bridge edits upstream markup.
 *
 * Hard rule: HTML documents only. JS, CSS, JSON and binary assets must stream through
 * byte-for-byte — a corrupted bundle takes the whole SPA down. The scanner below walks the
 * document once and only ever touches text nodes, the document `<title>`, and the `content`
 * attribute of an allowlist of user-visible `<meta>` tags. Tag names, attributes, inline
 * `<script>`/`<style>` bodies and comments are copied verbatim, so no rewrite can reach a
 * URL, an identifier, or executable code.
 */

/** Product name shown to users of this deployment. */
export const CRM_BRAND_NAME = 'Indobase CRM'

/**
 * Upstream product name → Indobase name, applied to visible text only.
 * Only the full product phrase is replaced — a bare "Frappe" may be upstream attribution.
 */
const BRAND_PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/Frappe\s+CRM/gi, CRM_BRAND_NAME],
  [/\bTwenty\b/g, CRM_BRAND_NAME],
  [/twentycrm/gi, 'indobase-crm'],
]

/** Element bodies that are not markup — never rewritten, never parsed. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style'])

/** `<meta>` keys whose `content` a user actually sees (tab/app label, share cards). */
const BRANDED_META_KEYS = new Set([
  'application-name',
  'apple-mobile-web-app-title',
  'description',
  'og:description',
  'og:site_name',
  'og:title',
  'twitter:description',
  'twitter:title',
])

/**
 * True only for real HTML documents. Anything else (JS, CSS, JSON, images, fonts,
 * and bodyless 204/304 responses that carry no content-type) must pass through.
 */
export function isHtmlContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  const essence = contentType.split(';', 1)[0]!.trim().toLowerCase()
  return essence === 'text/html' || essence === 'application/xhtml+xml'
}

function applyBrandPhrases(text: string): string {
  if (!text) return text
  let out = text
  for (const [pattern, replacement] of BRAND_PHRASES) {
    out = out.replace(pattern, replacement)
  }
  return out
}

type TagInfo = { name: string; closing: boolean }

/** Lowercased tag name at `lt`, or null when `<` is literal text (e.g. `a < b`). */
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

/** Index just past the tag's `>`, skipping `>` inside quoted attribute values. */
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

/** Range of the next `</name …>` at or after `from`, or null. */
function findCloseTag(html: string, name: string, from: number): { start: number; end: number } | null {
  const needle = `</${name}`
  const lower = html.toLowerCase()
  const start = lower.indexOf(needle, from)
  if (start === -1) return null
  return { start, end: findTagEnd(html, start) }
}

/** Rewrites only the `content` of user-visible metas; every other attribute is untouched. */
function rewriteMetaTag(tag: string): string {
  const key = /\b(?:name|property)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag)
  const keyName = (key?.[1] ?? key?.[2] ?? key?.[3] ?? '').trim().toLowerCase()
  if (!BRANDED_META_KEYS.has(keyName)) return tag
  return tag.replace(
    /(\bcontent\s*=\s*)(?:"([^"]*)"|'([^']*)')/i,
    (whole, prefix: string, doubleQuoted?: string, singleQuoted?: string) => {
      if (typeof doubleQuoted === 'string') return `${prefix}"${applyBrandPhrases(doubleQuoted)}"`
      if (typeof singleQuoted === 'string') return `${prefix}'${applyBrandPhrases(singleQuoted)}'`
      return whole
    }
  )
}

/**
 * Scrubs upstream product naming that only appears after the SPA mounts.
 * Text-node only — never touches attributes or script contents.
 */
const SPA_BRAND_SCRUB_SCRIPT = `<script data-indobase-brand-scrub>(function(){function scrub(){if(!document.body)return;var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);var n;while((n=w.nextNode())){if(n.nodeValue&&(/Frappe\\s+CRM|\\bTwenty\\b/i.test(n.nodeValue)))n.nodeValue=n.nodeValue.replace(/Frappe\\s+CRM/gi,${JSON.stringify(CRM_BRAND_NAME)}).replace(/\\bTwenty\\b/g,${JSON.stringify(CRM_BRAND_NAME)});}}new MutationObserver(scrub).observe(document.documentElement,{childList:true,subtree:true,characterData:true});if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scrub);else scrub();})();</script>`

/**
 * Rebrands one HTML document: forces the document title to `CRM_BRAND_NAME` and replaces
 * the upstream product name wherever it appears as visible text.
 *
 * An inline `<svg><title>` is an accessible name for an icon, not the document title, so
 * titles inside `<svg>` and any second `<title>` are left as ordinary text.
 */
export function rewriteBrandedHtml(html: string): string {
  if (!html) return html

  const out: string[] = []
  let headInsertAt = -1
  let titleDone = false
  let svgDepth = 0
  let i = 0

  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      out.push(applyBrandPhrases(html.slice(i)))
      break
    }
    if (lt > i) out.push(applyBrandPhrases(html.slice(i, lt)))

    // Comments, doctype, CDATA — verbatim.
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

    // Script/style bodies are code, not copy — copy the whole element untouched.
    if (!info.closing && RAW_TEXT_ELEMENTS.has(info.name) && !rawTag.trimEnd().endsWith('/>')) {
      const close = findCloseTag(html, info.name, tagEnd)
      const stop = close ? close.end : html.length
      out.push(html.slice(lt, stop))
      i = stop
      continue
    }

    if (!info.closing && info.name === 'title' && svgDepth === 0 && !titleDone) {
      const close = findCloseTag(html, 'title', tagEnd)
      out.push(rawTag, CRM_BRAND_NAME, close ? html.slice(close.start, close.end) : '</title>')
      titleDone = true
      i = close ? close.end : html.length
      continue
    }

    if (info.name === 'svg') {
      if (info.closing) svgDepth = Math.max(0, svgDepth - 1)
      else if (!rawTag.trimEnd().endsWith('/>')) svgDepth += 1
    }

    out.push(!info.closing && info.name === 'meta' ? rewriteMetaTag(rawTag) : rawTag)
    i = tagEnd

    if (!info.closing && info.name === 'head' && headInsertAt === -1) headInsertAt = out.length
  }

  // Shell with no title at all would fall back to the URL in the tab — give it a name.
  if (!titleDone && headInsertAt !== -1) {
    out.splice(headInsertAt, 0, `<title>${CRM_BRAND_NAME}</title>`)
  }

  // Vue SPA copy (e.g. Access Denied) lives in JS bundles we must not rewrite. Inject a
  // tiny observer so user-visible text still says Indobase CRM after hydration.
  if (headInsertAt !== -1) {
    out.splice(headInsertAt, 0, SPA_BRAND_SCRUB_SCRIPT)
  }

  return out.join('')
}
