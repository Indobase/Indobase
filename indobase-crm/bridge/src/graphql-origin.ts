/**
 * Rewrite Twenty GraphQL `origin` args so multi-workspace auth works on the
 * public apex host (crm.indobase.in) without requiring browser hits to
 * `{subdomain}.crm.indobase.in`.
 */
import { crmTeamKeyForOrgSlug, crmWorkspaceOrigin } from './crm-map.js'
import { getOrgWorkspace } from './workspace-map.js'

export function rewriteGraphqlOriginBody(
  bodyText: string,
  opts: {
    publicBaseUrl: string
    orgSlug?: string
    workspaceOrigin?: string
  },
): string {
  if (!bodyText || !bodyText.includes('origin')) return bodyText

  let workspaceOrigin = (opts.workspaceOrigin || '').trim()
  if (!workspaceOrigin && opts.orgSlug) {
    const record = getOrgWorkspace(crmTeamKeyForOrgSlug(opts.orgSlug))
    if (record?.subdomain) {
      workspaceOrigin = crmWorkspaceOrigin(opts.publicBaseUrl, record.subdomain)
    }
  }
  if (!workspaceOrigin) return bodyText

  let publicOrigin = opts.publicBaseUrl.replace(/\/+$/, '')
  try {
    publicOrigin = new URL(publicOrigin).origin
  } catch {
    // keep as-is
  }

  try {
    const parsed = JSON.parse(bodyText) as {
      query?: string
      variables?: Record<string, unknown>
      origin?: string
    }

    let changed = false
    if (parsed.variables && typeof parsed.variables.origin === 'string') {
      const current = parsed.variables.origin
      if (!current || current === publicOrigin || current.startsWith(publicOrigin)) {
        parsed.variables.origin = workspaceOrigin
        changed = true
      }
    }
    // Some clients pass origin as a top-level field (rare).
    if (typeof parsed.origin === 'string') {
      const current = parsed.origin
      if (!current || current === publicOrigin || current.startsWith(publicOrigin)) {
        parsed.origin = workspaceOrigin
        changed = true
      }
    }

    // Inline GraphQL: origin: "https://crm.indobase.in"
    if (typeof parsed.query === 'string' && parsed.query.includes('origin')) {
      const escapedPublic = publicOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const nextQuery = parsed.query.replace(
        new RegExp(`origin\\s*:\\s*"${escapedPublic}"`, 'g'),
        `origin: "${workspaceOrigin}"`,
      )
      if (nextQuery !== parsed.query) {
        parsed.query = nextQuery
        changed = true
      }
    }

    return changed ? JSON.stringify(parsed) : bodyText
  } catch {
    return bodyText
  }
}

/** Map Twenty subdomain Location redirects back to the public CRM host. */
export function rewriteUpstreamLocation(
  location: string | null,
  publicBaseUrl: string,
): string | null {
  if (!location) return location
  const base = publicBaseUrl.replace(/\/+$/, '')
  let publicHost: string
  try {
    publicHost = new URL(base).host
  } catch {
    return location
  }

  try {
    const url = new URL(location, base)
    if (url.host === publicHost) return location
    if (url.host.endsWith(`.${publicHost}`)) {
      url.host = publicHost
      return url.toString()
    }
  } catch {
    return location
  }
  return location
}
