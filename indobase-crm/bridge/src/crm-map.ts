/**
 * Deterministic org/project → CRM team / pipeline keys.
 *
 * Must stay in sync with `frappe-app/indobase_crm/indobase_crm/utils/crm_map.py`
 * and `apps/studio/lib/api/saas/crm-launch-shared.ts`.
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

/** Bridge deep link after SSO — proxies to upstream CRM SPA. */
export function crmPipelinePath(map: CrmScopeMap): string {
  return `/c/${encodeURIComponent(map.teamKey)}/${encodeURIComponent(map.pipelineKey)}`
}

/** Frappe CRM website rule requires a path segment; `/crm/leads` is the desk entry. */
const CRM_SPA_ENTRY = '/crm/leads'

/** Static/API paths must reach Frappe unchanged — do not rewrite to the SPA shell. */
function passthroughUpstreamPath(bridgePath: string): string | null {
  if (
    bridgePath.startsWith('/assets/') ||
    bridgePath.startsWith('/files/') ||
    bridgePath.startsWith('/api/') ||
    bridgePath.startsWith('/app/')
  ) {
    return bridgePath
  }
  return null
}

/** Upstream Frappe CRM SPA entry (production proxy target). */
export function upstreamCrmPath(bridgePath: string): string {
  const passthrough = passthroughUpstreamPath(bridgePath)
  if (passthrough) return passthrough

  if (bridgePath.startsWith('/c/')) {
    // Frappe CRM SPA has no client route for ib_pipeline — land on desk entry.
    return CRM_SPA_ENTRY
  }
  if (bridgePath.startsWith('/app/setup-wizard')) {
    return CRM_SPA_ENTRY
  }
  if (bridgePath.startsWith('/crm')) {
    return `${CRM_SPA_ENTRY}${bridgePath.slice('/crm'.length)}`
  }
  if (bridgePath.startsWith('/app/crm')) return CRM_SPA_ENTRY
  return CRM_SPA_ENTRY
}
