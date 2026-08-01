/**
 * Deterministic org/project → CRM team / pipeline keys.
 *
 * Must stay in sync with `apps/studio/lib/api/saas/crm-launch-shared.ts`.
 * Deep links land on the CRM home; keys remain available for future workspace filters.
 */

export type CrmScopeMap = {
  orgSlug: string
  projectRef: string
  teamKey: string
  pipelineKey: string
  teamTitle: string
  pipelineTitle: string
}

const MAX_KEY_LEN = 64

function cleanSlug(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9-]/.test(c))
    .join('')
    .slice(0, MAX_KEY_LEN)
}

function cleanProjectRef(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 40)
}

/** Stable sales team key for an Indobase organization slug. */
export function crmTeamKeyForOrgSlug(orgSlug: string): string {
  const cleaned = cleanSlug(orgSlug)
  if (!cleaned) return 'ib-crm-org-default'
  return `ib-crm-org-${cleaned}`.slice(0, MAX_KEY_LEN)
}

/** Stable pipeline key for an Indobase project ref. */
export function crmPipelineKeyForProjectRef(projectRef: string): string {
  const cleaned = cleanProjectRef(projectRef)
  if (!cleaned) return 'ib-crm-proj-default'
  return `ib-crm-proj-${cleaned}`.slice(0, MAX_KEY_LEN)
}

export function buildCrmScopeMap(opts: {
  orgSlug: string
  projectRef: string
  projectName?: string
  organizationName?: string
}): CrmScopeMap {
  const orgSlug = opts.orgSlug.trim()
  const projectRef = opts.projectRef.trim()
  const teamKey = crmTeamKeyForOrgSlug(orgSlug)
  const pipelineKey = crmPipelineKeyForProjectRef(projectRef)
  const teamTitle = (opts.organizationName || orgSlug || 'Organization').slice(0, 140)
  const pipelineTitle = (opts.projectName || projectRef || 'Project').slice(0, 140)

  return {
    orgSlug,
    projectRef,
    teamKey,
    pipelineKey,
    teamTitle,
    pipelineTitle,
  }
}

/**
 * Twenty multi-workspace subdomain for an org team key.
 * Kept short/alnum so Twenty accepts it; stable across handoffs.
 */
export function crmWorkspaceSubdomainForTeamKey(teamKey: string): string {
  const cleaned = teamKey
    .toLowerCase()
    .replace(/^ib-crm-org-/, 'o-')
    .split('')
    .filter((c) => /[a-z0-9-]/.test(c))
    .join('')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
  if (!cleaned || cleaned === 'o') return 'o-default'
  return cleaned
}

/** Synthetic workspace origin used for Twenty GraphQL `origin` checks (apex stays public). */
export function crmWorkspaceOrigin(publicBaseUrl: string, subdomain: string): string {
  const base = publicBaseUrl.replace(/\/+$/, '')
  let host: string
  try {
    host = new URL(base).host
  } catch {
    host = 'crm.indobase.in'
  }
  const proto = base.startsWith('http://') ? 'http' : 'https'
  const sub = subdomain.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'o-default'
  return `${proto}://${sub}.${host}`
}

/** Post-SSO landing — CRM opportunities board (engine-agnostic path via bridge). */
export function crmPipelinePath(map: CrmScopeMap): string {
  const q = new URLSearchParams({
    ib_team: map.teamKey,
    ib_pipeline: map.pipelineKey,
  })
  return `/objects/opportunities?${q.toString()}`
}

/** Static/API paths must reach upstream unchanged. */
function passthroughUpstreamPath(bridgePath: string): string | null {
  if (
    bridgePath.startsWith('/assets/') ||
    bridgePath.startsWith('/files/') ||
    bridgePath.startsWith('/graphql') ||
    bridgePath.startsWith('/rest/') ||
    bridgePath.startsWith('/verify') ||
    bridgePath.startsWith('/objects/') ||
    bridgePath.startsWith('/settings/')
  ) {
    return bridgePath
  }
  return null
}

/** Upstream CRM SPA entry (production proxy target). */
export function upstreamCrmPath(bridgePath: string): string {
  const passthrough = passthroughUpstreamPath(bridgePath)
  if (passthrough) return passthrough

  if (bridgePath.startsWith('/c/')) {
    return '/objects/opportunities'
  }
  if (bridgePath.startsWith('/crm')) {
    if (bridgePath === '/crm' || bridgePath === '/crm/') return '/objects/opportunities'
    return bridgePath.replace(/^\/crm/, '') || '/objects/opportunities'
  }
  return bridgePath || '/'
}
