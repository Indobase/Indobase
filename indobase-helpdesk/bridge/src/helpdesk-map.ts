/**
 * Deterministic org/project → Helpdesk team / queue keys.
 *
 * Must stay in sync with `frappe-app/indobase_helpdesk/indobase_helpdesk/utils/helpdesk_map.py`
 * and `apps/studio/lib/api/saas/helpdesk-launch-shared.ts`.
 */

export type HelpdeskScopeMap = {
  orgSlug: string
  projectRef: string
  teamKey: string
  queueKey: string
  teamTitle: string
  queueTitle: string
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

/** Stable support team key for an Indobase organization slug. */
export function helpdeskTeamKeyForOrgSlug(orgSlug: string): string {
  const cleaned = cleanSlug(orgSlug)
  if (!cleaned) return 'ib-hd-org-default'
  return `ib-hd-org-${cleaned}`.slice(0, MAX_KEY_LEN)
}

/** Stable ticket queue key for an Indobase project ref. */
export function helpdeskQueueKeyForProjectRef(projectRef: string): string {
  const cleaned = cleanProjectRef(projectRef)
  if (!cleaned) return 'ib-hd-proj-default'
  return `ib-hd-proj-${cleaned}`.slice(0, MAX_KEY_LEN)
}

export function buildHelpdeskScopeMap(opts: {
  orgSlug: string
  projectRef: string
  projectName?: string
  organizationName?: string
}): HelpdeskScopeMap {
  const orgSlug = opts.orgSlug.trim()
  const projectRef = opts.projectRef.trim()
  const teamKey = helpdeskTeamKeyForOrgSlug(orgSlug)
  const queueKey = helpdeskQueueKeyForProjectRef(projectRef)
  const teamTitle = (opts.organizationName || orgSlug || 'Organization').slice(0, 140)
  const queueTitle = (opts.projectName || projectRef || 'Project').slice(0, 140)

  return {
    orgSlug,
    projectRef,
    teamKey,
    queueKey,
    teamTitle,
    queueTitle,
  }
}

/** Bridge deep link after SSO — agent desk for the project queue. */
export function helpdeskAgentPath(map: HelpdeskScopeMap): string {
  return `/h/${encodeURIComponent(map.teamKey)}/${encodeURIComponent(map.queueKey)}`
}

/** Customer portal entry for the same org/project scope. */
export function helpdeskPortalPath(map: HelpdeskScopeMap): string {
  return `/portal/${encodeURIComponent(map.teamKey)}/${encodeURIComponent(map.queueKey)}`
}

/** Upstream Frappe Helpdesk SPA entry (production proxy target). */
export function upstreamHelpdeskPath(bridgePath: string, portal = false): string {
  if (bridgePath.startsWith('/h/')) {
    const parts = bridgePath.split('/').filter(Boolean)
    if (parts.length >= 3) {
      const queueKey = decodeURIComponent(parts[2])
      return `/helpdesk?ib_queue=${encodeURIComponent(queueKey)}`
    }
  }
  if (bridgePath.startsWith('/portal/')) {
    const parts = bridgePath.split('/').filter(Boolean)
    if (parts.length >= 3) {
      const queueKey = decodeURIComponent(parts[2])
      return `/helpdesk/my-tickets?ib_queue=${encodeURIComponent(queueKey)}`
    }
    return '/helpdesk/my-tickets'
  }
  if (bridgePath.startsWith('/helpdesk')) return bridgePath
  return portal ? '/helpdesk/my-tickets' : '/helpdesk'
}
