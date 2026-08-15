/**
 * CFOS client-router shell paths that must be served as the SPA index on hard refresh.
 * Singular `/workspace/<id>` stays on a preservePath route so the CFOS SPA
 * deep-link loads; guests use in-chat auth (no separate sign-in gate).
 */
export const CFOS_SPA_SHELL_PREFIXES = [
  '/workspaces',
  '/blueprints',
  '/outputs',
  '/explore',
  '/gatekeepers',
  '/connections',
  '/settings',
  '/apps',
] as const

export function isCfosSpaShellPath(pathname: string): boolean {
  const path = pathname.split('?')[0] || ''
  return CFOS_SPA_SHELL_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )
}
