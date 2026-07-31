/**
 * Deterministic org/project → Mattermost team / channel keys.
 *
 * Must stay in sync with `apps/studio/lib/api/saas/discuss-launch-shared.ts`.
 *
 * Keys (`teamKey` / `spaceKey`) are slugs: stable, URL-visible, never rewritten.
 * Titles are human labels shown in the sidebar and must never be an internal key.
 */
import { humanizeTitle } from './channel-plan.js'

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

/** Stable Mattermost team `name` for an Indobase organization slug. */
export function discussTeamKeyForOrgSlug(orgSlug: string): string {
  const cleaned = cleanSlug(orgSlug)
  if (!cleaned) return 'ib-org-default'
  return `ib-org-${cleaned}`.slice(0, MAX_KEY_LEN)
}

/** Stable Mattermost channel `name` for an Indobase project ref. */
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
  // Display names derive from the org/project NAME. The ref is only a fallback,
  // and `ib-org-…` / `ib-proj-…` keys are stripped so a key can never surface.
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

/** Deep link after SSO — Mattermost team/channel path. */
export function discussChannelPath(map: DiscussSpaceMap): string {
  return `/${encodeURIComponent(map.teamKey)}/channels/${encodeURIComponent(map.spaceKey)}`
}
