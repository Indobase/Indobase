/**
 * Deterministic org/project → Gameplan Team (community) / Project (space) keys.
 *
 * Must stay in sync with:
 * - `frappe-app/indobase_discuss/indobase_discuss/utils/space_map.py`
 * - `apps/studio/lib/api/saas/discuss-launch-shared.ts`
 *
 * Keys (`teamKey` / `spaceKey`) are slugs: stable, never rewritten.
 * Titles are human labels and must never be an internal key.
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
const INTERNAL_KEY_PREFIX = /^ib-(?:proj|org)-/i

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

function titleCase(words: string): string {
  return words
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Turn slug/key-ish input into a human label for sidebar titles. */
export function humanizeTitle(raw: string | null | undefined, fallback: string): string {
  const collapsed = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!collapsed) return fallback
  const stripped = collapsed.replace(INTERNAL_KEY_PREFIX, '').trim()
  if (!stripped) return fallback
  if (!/\s/.test(stripped) && /[-_]/.test(stripped)) {
    return titleCase(stripped.split(/[-_]+/).join(' ')).slice(0, 64)
  }
  return stripped.slice(0, 64)
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
  const teamTitle = humanizeTitle(opts.organizationName || orgSlug, 'Organization')
  const spaceTitle = humanizeTitle(opts.projectName || projectRef, 'Project')

  return {
    orgSlug,
    projectRef,
    teamKey,
    spaceKey,
    teamTitle,
    spaceTitle,
  }
}

/**
 * Canonical Gameplan SPA deep link for Frappe document names.
 * Vue router base is `/g/`; spaces live at `/community/:communityId/space/:spaceId`.
 * The old `/g/:team/:space` shape does not match any route and leaves App.vue blank
 * (not Login, not Layout).
 */
export function gameplanSpacePathForDocs(teamDoc: string, spaceDoc: string): string {
  return `/g/community/${encodeURIComponent(teamDoc)}/space/${encodeURIComponent(spaceDoc)}`
}

/**
 * Fallback when we only have deterministic keys (no SSO doc names yet).
 * GP Project names are autoname integers — `spaceKey` is not a routable id.
 * Land on the community shell (team name is set to `teamKey` on provision).
 */
export function gameplanSpacePath(map: DiscussSpaceMap): string {
  return `/g/community/${encodeURIComponent(map.teamKey)}`
}

/** Reserved first segments under `/g/` that are not team document names. */
const RESERVED_G_FIRST = new Set([
  'community',
  'settings',
  'people',
  'search',
  'onboarding',
  'notifications',
  'list',
  'spaces',
  'more',
  'login',
  'profile',
  'home',
  'new-discussion',
  'no-communities',
  '404',
])

/** Reserved second segments for legacy `/g/:team/...` trees. */
const RESERVED_G_SECOND = new Set([
  'projects',
  'discussions',
  'pages',
  'tasks',
  'space',
  'members',
  'overview',
])

/**
 * Rewrite obsolete `/g/:team/:space` bookmarks to the canonical community/space URL.
 * Returns null when the path is already canonical or not a two-segment deep link.
 */
export function rewriteLegacyGameplanPath(pathname: string): string | null {
  const m = /^\/g\/([^/]+)\/([^/]+)\/?$/.exec(pathname)
  if (!m) return null
  const team = m[1]!
  const space = m[2]!
  if (RESERVED_G_FIRST.has(team) || RESERVED_G_SECOND.has(space)) return null
  return gameplanSpacePathForDocs(decodeURIComponent(team), decodeURIComponent(space))
}
