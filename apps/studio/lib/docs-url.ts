import { STUDIO_DOCS_PATH_MAP, STUDIO_DOCS_PREFIXES } from 'common/studio-docs-path-map'

/**
 * Resolves Studio "Docs" links to paths that exist on https://indobase.in/docs.
 */

const DOCS_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DOCS_URL?.replace(/\/$/, '')) ||
  'https://indobase.in/docs'

function mapDocsPath(pathWithQueryHash: string): string {
  const hashIdx = pathWithQueryHash.indexOf('#')
  const queryIdx = pathWithQueryHash.indexOf('?')
  const cut =
    hashIdx === -1
      ? queryIdx === -1
        ? pathWithQueryHash.length
        : queryIdx
      : queryIdx === -1
        ? hashIdx
        : Math.min(hashIdx, queryIdx)
  const pathOnly = pathWithQueryHash.slice(0, cut).replace(/^\/+/, '')
  const suffix = pathWithQueryHash.slice(cut)

  if (!pathOnly) return '' + suffix

  const exact = STUDIO_DOCS_PATH_MAP.exact[pathOnly]
  if (exact) return exact + suffix

  for (const [prefix, target] of STUDIO_DOCS_PREFIXES) {
    if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)) {
      // Mapped target may include a fragment; ignore legacy Supabase anchors.
      if (target.includes('#') && suffix.startsWith('#')) {
        return target + (suffix.includes('?') ? suffix.slice(suffix.indexOf('?')) : '')
      }
      return target + suffix
    }
  }

  if (
    pathOnly.startsWith('guides/') ||
    pathOnly.startsWith('reference/') ||
    pathOnly.startsWith('learn/')
  ) {
    return '' + suffix
  }

  return pathOnly + suffix
}

/** Build a docs URL under {@link DOCS_BASE}. */
export function docsUrl(path = ''): string {
  const trimmed = path.trim()
  if (!trimmed) return DOCS_BASE
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return resolveStudioDocsHref(trimmed)
  }
  const normalized = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  const mapped = mapDocsPath(normalized)
  return mapped ? `${DOCS_BASE}/${mapped}` : DOCS_BASE
}

/** Rewrite legacy Supabase-style docs URLs to working indobase.in paths. */
export function resolveStudioDocsHref(href: string): string {
  try {
    const url = new URL(href)
    const hosts = ['indobase.in', 'www.indobase.in', 'supabase.com', 'www.supabase.com']
    if (!hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
      return href
    }
    const basePath = url.pathname.startsWith('/docs')
      ? url.pathname.slice('/docs'.length).replace(/^\//, '')
      : url.pathname.replace(/^\//, '')
    const mapped = mapDocsPath(`${basePath}${url.search}${url.hash}`)
    return mapped ? `${DOCS_BASE}/${mapped}` : DOCS_BASE
  } catch {
    return docsUrl(href)
  }
}

export { DOCS_BASE as DOCS_SITE_BASE }
