/**
 * Builder preview iframe vs public live site.
 *
 * Preview is same-origin `/live/{ref}/` so the workspace iframe can load it.
 * Public `*.sites.indobase.in` keeps X-Frame-Options DENY — do not weaken it.
 */

export const PREVIEW_EMBED_CSP = "frame-ancestors 'self'" as const

export function isLivePreviewPath(pathname: string): boolean {
  const path = pathname.split('?')[0] || pathname
  return path === '/live' || path.startsWith('/live/')
}

export function embeddablePreviewPath(projectRef: string): string {
  const ref = (projectRef || '').trim()
  return ref ? `/live/${ref}/` : ''
}

export function isEmbeddablePreviewUrl(url: string | null | undefined): boolean {
  const raw = (url || '').trim()
  if (!raw) return false
  if (raw.startsWith('/live/')) return true
  try {
    const parsed = new URL(raw, 'https://builder.indobase.in')
    return parsed.pathname.startsWith('/live/')
  } catch {
    return false
  }
}

/** Prefer the same-origin draft lane for the Builder iframe. Never sites.indobase.in. */
export function embeddablePreviewSrc(input: {
  projectRef?: string | null
  previewUrl?: string | null
  liveUrl?: string | null
}): string | null {
  const path = embeddablePreviewPath(input.projectRef || '')
  if (path) return path
  if (isEmbeddablePreviewUrl(input.previewUrl)) return input.previewUrl || null
  if (isEmbeddablePreviewUrl(input.liveUrl)) return input.liveUrl || null
  return null
}

export function previewEmbedResponseHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': PREVIEW_EMBED_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=30',
    'X-Indobase-Launch-Lane': 'preview-embed',
  }
}
