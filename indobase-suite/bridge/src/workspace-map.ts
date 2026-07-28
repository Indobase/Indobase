/**
 * Deterministic org/project → Workspace team / project keys.
 *
 * Must stay in sync with `frappe-app/indobase_suite/indobase_suite/utils/workspace_map.py`.
 */

export type WorkspaceMap = {
  orgSlug: string
  projectRef: string
  teamKey: string
  projectKey: string
  teamTitle: string
  projectTitle: string
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

/** Stable team key for an Indobase organization slug. */
export function workspaceTeamKeyForOrgSlug(orgSlug: string): string {
  const cleaned = cleanSlug(orgSlug)
  if (!cleaned) return 'ib-ws-org-default'
  return `ib-ws-org-${cleaned}`.slice(0, MAX_KEY_LEN)
}

/** Stable project key for an Indobase project ref. */
export function workspaceProjectKeyForProjectRef(projectRef: string): string {
  const cleaned = cleanProjectRef(projectRef)
  if (!cleaned) return 'ib-ws-proj-default'
  return `ib-ws-proj-${cleaned}`.slice(0, MAX_KEY_LEN)
}

export function buildWorkspaceMap(opts: {
  orgSlug: string
  projectRef: string
  projectName?: string
  organizationName?: string
}): WorkspaceMap {
  const orgSlug = opts.orgSlug.trim()
  const projectRef = opts.projectRef.trim()
  const teamKey = workspaceTeamKeyForOrgSlug(orgSlug)
  const projectKey = workspaceProjectKeyForProjectRef(projectRef)
  const teamTitle = (opts.organizationName || orgSlug || 'Organization').slice(0, 140)
  const projectTitle = (opts.projectName || projectRef || 'Project').slice(0, 140)

  return {
    orgSlug,
    projectRef,
    teamKey,
    projectKey,
    teamTitle,
    projectTitle,
  }
}

/** Workspace home deep link (bridge path; upstream proxy maps /s/*). */
export function workspaceHomePath(map: WorkspaceMap): string {
  return `/s/${encodeURIComponent(map.teamKey)}/${encodeURIComponent(map.projectKey)}`
}
