/**
 * Indobase product path aliases → upstream scheduling routes.
 * Customers see /events, /team, /settings — never engine-branded paths in product chrome.
 */

const ALIASES: Record<string, string> = {
  '/events': '/event-types',
  '/team': '/teams',
  '/settings': '/settings/my-account',
}

export function rewriteProductPath(pathname: string): string | null {
  if (ALIASES[pathname]) return ALIASES[pathname]
  // Preserve nested settings under Indobase alias
  if (pathname.startsWith('/settings/') && !pathname.startsWith('/settings/my-account')) {
    return pathname
  }
  if (pathname === '/event-types') return '/events'
  if (pathname === '/teams' || pathname === '/teams/') return '/team'
  return null
}

/** Paths that should 302 to the Indobase alias (when serving HTML navigation). */
export function canonicalProductPath(pathname: string): string | null {
  if (pathname === '/event-types' || pathname.startsWith('/event-types/')) {
    return pathname.replace(/^\/event-types/, '/events')
  }
  if (pathname === '/teams' || pathname === '/teams/') return '/team'
  return null
}

export function isProductAliasPath(pathname: string): boolean {
  return pathname === '/events' || pathname === '/team' || pathname === '/settings' || pathname.startsWith('/settings/')
}
