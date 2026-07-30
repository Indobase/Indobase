/**
 * Brand Mattermost HTML responses as Indobase Discuss.
 * Only rewrite text/html — never touch JS/CSS/JSON (SPA must keep working).
 */

const FAVICON_LINK =
  '<link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />'
const TITLE_TAG = '<title>Indobase Discuss</title>'

/** Rewrite document title + inject favicon; strip obvious "Mattermost" title leftovers. */
export function brandDiscussHtml(html: string): string {
  let out = html

  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, TITLE_TAG)
  } else if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}${TITLE_TAG}`)
  }

  if (!/rel=["']icon["']/i.test(out) && /<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}${FAVICON_LINK}`)
  }

  // Defensive: bare product name in <title> already replaced; also catch
  // meta application-name / og:site_name when present in the shell HTML.
  out = out.replace(
    /(<meta\b[^>]*\b(?:name|property)=["'](?:application-name|og:site_name)["'][^>]*\bcontent=["'])([^"']*)(["'])/gi,
    '$1Indobase Discuss$3'
  )
  out = out.replace(
    /(<meta\b[^>]*\bcontent=["'])([^"']*)(["'][^>]*\b(?:name|property)=["'](?:application-name|og:site_name)["'])/gi,
    (_, a, _content, c) => `${a}Indobase Discuss${c}`
  )

  return out
}

export function shouldBrandDiscussResponse(contentType: string | null): boolean {
  if (!contentType) return false
  const ct = contentType.toLowerCase()
  return ct.includes('text/html')
}
