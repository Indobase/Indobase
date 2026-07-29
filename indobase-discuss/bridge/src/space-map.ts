/**
 * Deterministic org/project → Gameplan Team (community) / Project (space) keys.
 *
 * Must stay in sync with `frappe-app/indobase_discuss/indobase_discuss/utils/space_map.py`.
 */

export type DiscussSpaceMap = {
  orgSlug: string
  projectRef: string
  teamKey: string
  spaceKey: string
  teamTitle: string
  spaceTitle: string
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
export function discussTeamKeyForOrgSlug(orgSlug: string): string {
  const cleaned = cleanSlug(orgSlug)
  if (!cleaned) return 'ib-org-default'
  return `ib-org-${cleaned}`.slice(0, MAX_KEY_LEN)
}

/** Stable space (GP Project) key for an Indobase project ref. */
export function discussSpaceKeyForProjectRef(projectRef: string): string {
  const cleaned = cleanProjectRef(projectRef)
  if (!cleaned) return 'ib-proj-default'
  return `ib-proj-${cleaned}`.slice(0, MAX_KEY_LEN)
}

export function buildDiscussSpaceMap(opts: {
  orgSlug: string
  projectRef: string
  projectName?: string
  organizationName?: string
}): DiscussSpaceMap {
  const orgSlug = opts.orgSlug.trim()
  const projectRef = opts.projectRef.trim()
  const teamKey = discussTeamKeyForOrgSlug(orgSlug)
  const spaceKey = discussSpaceKeyForProjectRef(projectRef)
  const teamTitle = (opts.organizationName || orgSlug || 'Organization').slice(0, 140)
  const spaceTitle = (opts.projectName || projectRef || 'Project').slice(0, 140)

  return {
    orgSlug,
    projectRef,
    teamKey,
    spaceKey,
    teamTitle,
    spaceTitle,
  }
}

/** Gameplan SPA deep link after SSO (community + space doc names from Frappe). */
export function gameplanSpacePath(team: string, space: string): string {
  return `/community/${encodeURIComponent(team)}/space/${encodeURIComponent(space)}`
}
