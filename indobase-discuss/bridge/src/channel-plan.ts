/**
 * Project-first channel plan for Indobase Discuss teams.
 *
 * The upstream engine seeds every new team with exactly two channels —
 * `town-square` ("Town Square") and `off-topic` ("Off-Topic"). Both display names
 * are recognisably upstream vocabulary, so each Indobase team is re-shaped into a
 * workspace that reads like a product: General / Announcements / Support /
 * Development / Design / Marketing.
 *
 * Rules that must not be broken:
 *  - `town-square` keeps its slug forever. The server hardcodes that slug as the
 *    team default channel for join/leave/permission logic — only `display_name`
 *    ever moves.
 *  - Slugs are deep links (`/{team}/channels/{slug}`). New channels get clean
 *    slugs; an existing slug is never rewritten.
 *  - Display names are human labels ("General"), never internal keys
 *    (`ib-proj-92834`). Keys stay in the URL, names stay in the sidebar.
 *  - An admin's own rename always wins. We only relabel a channel that still
 *    carries the upstream default label or a raw internal key.
 *
 * This list is mirrored by `docker/bootstrap-mattermost.sh` (which retrofits
 * teams that already exist); `channel-plan.test.ts` asserts the two stay in sync.
 */

export type DiscussChannelPlanEntry = {
  /** Channel `name` (slug). Stable — deep links depend on it. */
  name: string
  /** Human label rendered in the sidebar. */
  displayName: string
  purpose: string
  /** false → the server already created it on team create; we only relabel it. */
  createIfMissing: boolean
}

/** Hardcoded server-side as the team default channel. Rename the label, never the slug. */
export const DISCUSS_DEFAULT_CHANNEL_SLUG = 'town-square'
/** Second auto-created channel. Not load-bearing server-side. */
export const DISCUSS_OFF_TOPIC_SLUG = 'off-topic'
/** Label off-topic gets when it already has messages and therefore must not be archived. */
export const OFF_TOPIC_REPLACEMENT_DISPLAY_NAME = 'Random'

/**
 * Labels the upstream engine ships. Only these (or an empty/internal-key label)
 * may be overwritten — anything else was chosen by a human.
 */
export const UPSTREAM_DEFAULT_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  [DISCUSS_DEFAULT_CHANNEL_SLUG]: 'Town Square',
  [DISCUSS_OFF_TOPIC_SLUG]: 'Off-Topic',
}

export const DISCUSS_TEAM_CHANNELS: readonly DiscussChannelPlanEntry[] = [
  {
    name: DISCUSS_DEFAULT_CHANNEL_SLUG,
    displayName: 'General',
    purpose: 'Everyone in the organization. Day-to-day conversation.',
    createIfMissing: false,
  },
  {
    name: 'announcements',
    displayName: 'Announcements',
    purpose: 'Product and company announcements',
    createIfMissing: true,
  },
  {
    name: 'support',
    displayName: 'Support',
    purpose: 'Questions, requests and help',
    createIfMissing: true,
  },
  {
    name: 'development',
    displayName: 'Development',
    purpose: 'Engineering work, builds and releases',
    createIfMissing: true,
  },
  {
    name: 'design',
    displayName: 'Design',
    purpose: 'Product, brand and interface design',
    createIfMissing: true,
  },
  {
    name: 'marketing',
    displayName: 'Marketing',
    purpose: 'Campaigns, content and growth',
    createIfMissing: true,
  },
]

/** Channels the plan creates (everything the server does not seed itself). */
export function channelsToCreate(): DiscussChannelPlanEntry[] {
  return DISCUSS_TEAM_CHANNELS.filter((c) => c.createIfMissing)
}

/** Channels the plan only relabels (seeded by the server, slug is load-bearing). */
export function channelsToRelabel(): DiscussChannelPlanEntry[] {
  return DISCUSS_TEAM_CHANNELS.filter((c) => !c.createIfMissing)
}

const INTERNAL_KEY_PREFIX = /^ib-(?:proj|org)-/i

/** True when a display name is really an internal key leaking into the UI. */
export function looksLikeInternalKey(value: string, slug?: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (slug && trimmed === slug) return true
  return INTERNAL_KEY_PREFIX.test(trimmed)
}

function titleCase(words: string): string {
  return words
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Turn whatever we were handed into something a person can read.
 *
 * Keeps human input verbatim ("My App" stays "My App") and only rewrites values
 * that look machine-generated: internal `ib-proj-…` / `ib-org-…` keys lose the
 * prefix, and separator-delimited slugs ("my-app") become Title Case.
 */
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

/**
 * May we overwrite this channel's display name?
 *
 * Yes when it is blank, still the upstream default for that slug, or a raw
 * internal key. No when a human already named it something else.
 */
export function shouldRelabelChannel(
  slug: string,
  current: string | null | undefined,
  desired: string
): boolean {
  const target = desired.trim()
  if (!target) return false
  const cur = (current ?? '').trim()
  if (cur === target) return false
  if (!cur) return true
  const upstream = UPSTREAM_DEFAULT_DISPLAY_NAMES[slug]
  if (upstream && cur.toLowerCase() === upstream.toLowerCase()) return true
  return looksLikeInternalKey(cur, slug)
}

export type OffTopicAction = 'none' | 'archive' | 'relabel'

/**
 * Off-Topic is safe to archive only while it is untouched. The moment it holds a
 * single message it becomes user data, so we relabel it instead of hiding it.
 */
export function planOffTopicAction(
  channel: { display_name?: string | null; total_msg_count?: number | null } | null | undefined
): OffTopicAction {
  if (!channel) return 'none'
  const current = (channel.display_name ?? '').trim()
  const upstream = UPSTREAM_DEFAULT_DISPLAY_NAMES[DISCUSS_OFF_TOPIC_SLUG]
  const isUpstreamLabel = !current || current.toLowerCase() === upstream.toLowerCase()
  if (!isUpstreamLabel) return 'none'
  return channel.total_msg_count === 0 ? 'archive' : 'relabel'
}

// ── Executor ─────────────────────────────────────────────────────────────────

/** Minimal admin-API surface the plan needs; injected so this module stays pure-ish. */
export type MmApiCall = (
  path: string,
  init?: { method?: string; body?: unknown }
) => Promise<{ status: number; json: unknown }>

export type TeamChannelPlanResult = {
  created: string[]
  relabeled: string[]
  archived: string[]
  unchanged: string[]
  failed: string[]
}

type MmChannelLike = {
  id?: string
  display_name?: string | null
  total_msg_count?: number | null
}

function emptyResult(): TeamChannelPlanResult {
  return { created: [], relabeled: [], archived: [], unchanged: [], failed: [] }
}

async function getChannelByName(
  api: MmApiCall,
  teamId: string,
  slug: string
): Promise<MmChannelLike | null> {
  const res = await api(`/api/v4/teams/${teamId}/channels/name/${encodeURIComponent(slug)}`, {
    method: 'GET',
  })
  if (res.status !== 200) return null
  return (res.json ?? null) as MmChannelLike | null
}

/**
 * Shape a freshly created team into the Indobase workspace. Best effort: a
 * failure here must never block SSO, so nothing throws.
 */
export async function applyTeamChannelPlan(
  api: MmApiCall,
  teamId: string
): Promise<TeamChannelPlanResult> {
  const result = emptyResult()
  if (!teamId) return result

  for (const entry of channelsToRelabel()) {
    try {
      const existing = await getChannelByName(api, teamId, entry.name)
      if (!existing?.id) {
        result.unchanged.push(entry.name)
        continue
      }
      if (!shouldRelabelChannel(entry.name, existing.display_name, entry.displayName)) {
        result.unchanged.push(entry.name)
        continue
      }
      // display_name only — the slug is the team's default channel server-side.
      const patched = await api(`/api/v4/channels/${existing.id}/patch`, {
        method: 'PUT',
        body: { display_name: entry.displayName, purpose: entry.purpose },
      })
      if (patched.status === 200) result.relabeled.push(entry.name)
      else result.failed.push(entry.name)
    } catch {
      result.failed.push(entry.name)
    }
  }

  try {
    const offTopic = await getChannelByName(api, teamId, DISCUSS_OFF_TOPIC_SLUG)
    const action = planOffTopicAction(offTopic)
    if (!offTopic?.id || action === 'none') {
      result.unchanged.push(DISCUSS_OFF_TOPIC_SLUG)
    } else if (action === 'archive') {
      const del = await api(`/api/v4/channels/${offTopic.id}`, { method: 'DELETE' })
      if (del.status === 200) result.archived.push(DISCUSS_OFF_TOPIC_SLUG)
      else result.failed.push(DISCUSS_OFF_TOPIC_SLUG)
    } else {
      const patched = await api(`/api/v4/channels/${offTopic.id}/patch`, {
        method: 'PUT',
        body: { display_name: OFF_TOPIC_REPLACEMENT_DISPLAY_NAME },
      })
      if (patched.status === 200) result.relabeled.push(DISCUSS_OFF_TOPIC_SLUG)
      else result.failed.push(DISCUSS_OFF_TOPIC_SLUG)
    }
  } catch {
    result.failed.push(DISCUSS_OFF_TOPIC_SLUG)
  }

  for (const entry of channelsToCreate()) {
    try {
      const existing = await getChannelByName(api, teamId, entry.name)
      if (existing?.id) {
        result.unchanged.push(entry.name)
        continue
      }
      const created = await api('/api/v4/channels', {
        method: 'POST',
        body: {
          team_id: teamId,
          name: entry.name,
          display_name: entry.displayName,
          purpose: entry.purpose,
          type: 'O',
        },
      })
      if (created.status === 200 || created.status === 201) result.created.push(entry.name)
      else result.failed.push(entry.name)
    } catch {
      result.failed.push(entry.name)
    }
  }

  return result
}
