/**
 * Brand rewrite for upstream Gameplan / Frappe HTML shells.
 *
 * Only rewrite text/html — never touch JS/CSS/JSON (SPA must keep working).
 * Visible text + document title + allowlisted meta content only.
 */
/** Product name shown to users of this deployment. */
export const DISCUSS_BRAND_NAME = 'Indobase Discuss';
/**
 * Upstream product name → Indobase name, applied to visible text only.
 * Keep phrases specific so we do not rewrite AGPL attribution pages.
 */
const BRAND_PHRASES = [
    [/Frappe\s+Gameplan/gi, DISCUSS_BRAND_NAME],
    [/\bGameplan\b/g, 'Discuss'],
];
/** Element bodies that are not markup — never rewritten, never parsed. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);
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
]);
const FAVICON_LINKS = [
    '<link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />',
    '<link rel="icon" type="image/png" sizes="32x32" href="/brand/indobase-favicon-32.png" />',
    '<link rel="icon" type="image/png" sizes="16x16" href="/brand/indobase-favicon-16.png" />',
    '<link rel="apple-touch-icon" href="/brand/indobase-apple-touch.png" />',
].join('');
export function isHtmlContentType(contentType) {
    if (!contentType)
        return false;
    const essence = contentType.split(';', 1)[0].trim().toLowerCase();
    return essence === 'text/html' || essence === 'application/xhtml+xml';
}
export function shouldBrandDiscussResponse(contentType) {
    return isHtmlContentType(contentType);
}
function applyBrandPhrases(text) {
    if (!text)
        return text;
    let out = text;
    for (const [pattern, replacement] of BRAND_PHRASES) {
        out = out.replace(pattern, replacement);
    }
    return out;
}
function readTagName(html, lt) {
    let i = lt + 1;
    let closing = false;
    if (html[i] === '/') {
        closing = true;
        i += 1;
    }
    const start = i;
    while (i < html.length && /[a-zA-Z0-9:_-]/.test(html[i]))
        i += 1;
    if (i === start)
        return null;
    return { name: html.slice(start, i).toLowerCase(), closing };
}
function findTagEnd(html, lt) {
    let quote = '';
    for (let i = lt + 1; i < html.length; i += 1) {
        const ch = html[i];
        if (quote) {
            if (ch === quote)
                quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === '>')
            return i + 1;
    }
    return html.length;
}
function findCloseTag(html, name, from) {
    const needle = `</${name}`;
    const lower = html.toLowerCase();
    const start = lower.indexOf(needle, from);
    if (start === -1)
        return null;
    return { start, end: findTagEnd(html, start) };
}
function rewriteMetaTag(tag) {
    const key = /\b(?:name|property)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    const keyName = (key?.[1] ?? key?.[2] ?? key?.[3] ?? '').trim().toLowerCase();
    if (!BRANDED_META_KEYS.has(keyName))
        return tag;
    return tag.replace(/(\bcontent\s*=\s*)(?:"([^"]*)"|'([^']*)')/i, (whole, prefix, doubleQuoted, singleQuoted) => {
        if (typeof doubleQuoted === 'string')
            return `${prefix}"${applyBrandPhrases(doubleQuoted)}"`;
        if (typeof singleQuoted === 'string')
            return `${prefix}'${applyBrandPhrases(singleQuoted)}'`;
        return whole;
    });
}
/**
 * Rebrands one HTML document: forces the document title and replaces upstream
 * product names in visible text. Injects Indobase favicons after `<head>`.
 */
export function rewriteBrandedHtml(html) {
    if (!html)
        return html;
    const out = [];
    let headInsertAt = -1;
    let titleDone = false;
    let faviconDone = false;
    let svgDepth = 0;
    let i = 0;
    while (i < html.length) {
        const lt = html.indexOf('<', i);
        if (lt === -1) {
            out.push(applyBrandPhrases(html.slice(i)));
            break;
        }
        if (lt > i)
            out.push(applyBrandPhrases(html.slice(i, lt)));
        if (html.startsWith('<!--', lt)) {
            const end = html.indexOf('-->', lt + 4);
            const stop = end === -1 ? html.length : end + 3;
            out.push(html.slice(lt, stop));
            i = stop;
            continue;
        }
        if (html[lt + 1] === '!' || html[lt + 1] === '?') {
            const stop = findTagEnd(html, lt);
            out.push(html.slice(lt, stop));
            i = stop;
            continue;
        }
        const info = readTagName(html, lt);
        if (!info) {
            out.push('<');
            i = lt + 1;
            continue;
        }
        const tagEnd = findTagEnd(html, lt);
        const rawTag = html.slice(lt, tagEnd);
        if (!info.closing && RAW_TEXT_ELEMENTS.has(info.name) && !rawTag.trimEnd().endsWith('/>')) {
            const close = findCloseTag(html, info.name, tagEnd);
            const stop = close ? close.end : html.length;
            out.push(html.slice(lt, stop));
            i = stop;
            continue;
        }
        if (!info.closing && info.name === 'title' && svgDepth === 0 && !titleDone) {
            const close = findCloseTag(html, 'title', tagEnd);
            out.push(rawTag, DISCUSS_BRAND_NAME, close ? html.slice(close.start, close.end) : '</title>');
            titleDone = true;
            i = close ? close.end : html.length;
            continue;
        }
        if (info.name === 'svg') {
            if (info.closing)
                svgDepth = Math.max(0, svgDepth - 1);
            else if (!rawTag.trimEnd().endsWith('/>'))
                svgDepth += 1;
        }
        out.push(!info.closing && info.name === 'meta' ? rewriteMetaTag(rawTag) : rawTag);
        i = tagEnd;
        if (!info.closing && info.name === 'head' && headInsertAt === -1) {
            headInsertAt = out.length;
            if (!faviconDone) {
                out.push(FAVICON_LINKS);
                faviconDone = true;
            }
        }
    }
    if (!titleDone && headInsertAt !== -1) {
        out.splice(headInsertAt, 0, `<title>${DISCUSS_BRAND_NAME}</title>`);
    }
    return out.join('');
}
/** Alias used by the proxy path. */
export function brandDiscussHtml(html) {
    return rewriteBrandedHtml(html);
}
