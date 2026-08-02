import type {
  DiscussChannelWithUnread,
  DiscussJson,
  DiscussMember,
  DiscussMessage,
  DiscussRole,
} from 'data/discuss/discuss.types'

import { asEventObject, type DiscussMessageView } from './Discuss.types'
import {
  ACTIVITY_FAILURE_ICON,
  ACTIVITY_FAILURE_OUTCOMES,
  ACTIVITY_FALLBACK,
  ACTIVITY_KINDS,
  type ActivityAccent,
  type ActivityKind,
} from './Discuss.constants'

/**
 * Pure helpers. Everything that can be tested without a DOM lives here so the components stay
 * about rendering — see the studio-testing convention of extracting logic out of components.
 */

/** `viewer` is read-only across the ecosystem, and `messages_write` enforces it in the database. */
export const isReadOnlyRole = (role: DiscussRole | undefined) => role === 'viewer'

export const isActivityMessage = (message: DiscussMessage) => message.event_type !== null

export function initialsFor(name: string | null | undefined): string {
  const cleaned = (name ?? '').trim()
  if (cleaned.length === 0) return '?'
  const parts = cleaned.split(/\s+/).slice(0, 2)
  return parts.map((part) => part.charAt(0).toUpperCase()).join('')
}

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})
const DAY_WITH_YEAR_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function formatClockTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return TIME_FORMAT.format(date)
}

/** Absolute, unambiguous string for `title`/`aria-label` — relative time alone is not accessible. */
export function formatAbsoluteTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${DAY_WITH_YEAR_FORMAT.format(date)} at ${TIME_FORMAT.format(date)}`
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatDayDivider(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (dayDelta === 0) return 'Today'
  if (dayDelta === 1) return 'Yesterday'
  if (dayDelta < 7 && dayDelta > 0) return DAY_FORMAT.format(date)
  return DAY_WITH_YEAR_FORMAT.format(date)
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const seconds = Math.round((now.getTime() - date.getTime()) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 90) return '1m ago'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return DAY_WITH_YEAR_FORMAT.format(date)
}

export const isSameDay = (a: string, b: string) => {
  const first = new Date(a)
  const second = new Date(b)
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return false
  return startOfDay(first) === startOfDay(second)
}

/**
 * Consecutive messages from the same author within this window render without a repeated avatar
 * and name. Purely visual; it never merges two authors.
 */
const GROUPING_WINDOW_MS = 5 * 60 * 1000

export function shouldGroupWithPrevious(
  message: DiscussMessage,
  previous: DiscussMessage | undefined
): boolean {
  if (!previous) return false
  if (isActivityMessage(message) || isActivityMessage(previous)) return false
  if (message.author_id === null || message.author_id !== previous.author_id) return false
  if (!isSameDay(message.created_at, previous.created_at)) return false
  const delta = new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()
  return delta >= 0 && delta < GROUPING_WINDOW_MS
}

/**
 * The infinite query pages newest-first; the transcript reads oldest-first. Flattening and
 * reversing in one pure place keeps the ordering decision out of the render path, and dedupes the
 * overlap a poll can produce when a message lands between two page fetches.
 */
export function flattenMessagePages<T extends { id: string; created_at: string }>(
  pages: readonly (readonly T[])[] | undefined
): T[] {
  if (!pages) return []
  const seen = new Set<string>()
  const out: T[] = []
  for (const page of pages) {
    for (const message of page) {
      if (seen.has(message.id)) continue
      seen.add(message.id)
      out.push(message)
    }
  }
  return out.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

export const totalUnread = (channels: DiscussChannelWithUnread[] | undefined) =>
  (channels ?? []).reduce((sum, channel) => sum + (channel.unread ?? 0), 0)

/** Sidebar order: standard channels, then DMs/groups, activity last. Stable so the list never jumps. */
export function sortChannels(channels: DiscussChannelWithUnread[]): DiscussChannelWithUnread[] {
  const rank = (kind: DiscussChannelWithUnread['kind']) => {
    if (kind === 'standard') return 0
    if (kind === 'direct' || kind === 'group') return 1
    return 2
  }
  return [...channels].sort((a, b) => {
    const kindDelta = rank(a.kind) - rank(b.kind)
    if (kindDelta !== 0) return kindDelta
    return a.name.localeCompare(b.name)
  })
}

/** Resolve a DM / group channel's display name. */
export function directChannelLabel(
  channel: DiscussChannelWithUnread,
  members: DiscussMember[],
  currentMemberId: string | undefined
): string {
  if (channel.kind === 'group') return channel.name || 'Group message'
  if (channel.kind !== 'direct') return channel.name
  const other = members.find((member) => member.id !== currentMemberId)
  return other?.display_name || channel.name || 'Direct message'
}

/**
 * Highlight `@Name` mentions in plain message bodies. Mentions are stored as literal text so
 * search and FTS keep working — rendering is presentation-only.
 *
 * Prefer longest known member display names so `@Priya Shah` wins over `@Priya`.
 */
export function splitMentions(
  body: string,
  memberNames: string[] = []
): Array<{ type: 'text' | 'mention'; value: string }> {
  const names = [...memberNames]
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)

  const parts: Array<{ type: 'text' | 'mention'; value: string }> = []
  let index = 0

  while (index < body.length) {
    if (body[index] !== '@') {
      const nextAt = body.indexOf('@', index)
      const end = nextAt === -1 ? body.length : nextAt
      parts.push({ type: 'text', value: body.slice(index, end) })
      index = end
      continue
    }

    const rest = body.slice(index + 1)
    const matchedName = names.find(
      (name) => rest === name || rest.startsWith(`${name} `) || rest.startsWith(`${name}\n`)
    )

    if (matchedName) {
      parts.push({ type: 'mention', value: `@${matchedName}` })
      index += matchedName.length + 1
      continue
    }

    const single = rest.match(/^[A-Za-z0-9._-]+/)
    if (single) {
      parts.push({ type: 'mention', value: `@${single[0]}` })
      index += single[0].length + 1
      continue
    }

    parts.push({ type: 'text', value: '@' })
    index += 1
  }

  if (parts.length === 0) parts.push({ type: 'text', value: body })
  return parts
}

export const QUICK_REACTIONS = ['👍', '👀', '🎉', '❤️', '🙏'] as const

// ── Activity events ───────────────────────────────────────────────────────────────────────────

export interface ActivityField {
  label: string
  value: string
}

export interface ActivityDescriptor {
  kind: ActivityKind
  accent: ActivityAccent
  /** Family label, e.g. "Deploy". */
  eyebrow: string
  /** The headline of the card. Always non-empty, even for an unrecognised event_type. */
  title: string
  /** Outcome word from the event type, e.g. "succeeded". Empty when the type has no suffix. */
  outcome: string
  fields: ActivityField[]
  link: string | null
}

export function humaniseToken(token: string): string {
  const spaced = token.replace(/[_.-]+/g, ' ').trim()
  if (spaced.length === 0) return ''
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function asDisplayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim().length > 0 ? value.trim() : null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

const TITLE_KEYS = ['title', 'summary', 'headline', 'name', 'description', 'message'] as const
const LINK_KEYS = ['url', 'href', 'link', 'permalink'] as const
const HIDDEN_KEYS = new Set<string>([
  ...TITLE_KEYS,
  ...LINK_KEYS,
  'id',
  'project_ref',
  'event_type',
  'amount',
  'currency',
])
const MAX_FIELDS = 4

function formatAmount(data: Record<string, DiscussJson>): string | null {
  const preformatted = asDisplayValue(data.amount_formatted)
  if (preformatted) return preformatted

  const amount = data.amount
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return asDisplayValue(amount)

  const currency = typeof data.currency === 'string' ? data.currency.toUpperCase() : null
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return String(amount)

  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

/**
 * Turns a raw platform event into something renderable.
 *
 * Deliberately total: any `event_type` string and any `event_data` shape produces a complete
 * descriptor. `publish_event` accepts arbitrary jsonb from Builder, Payments and Deploy, so a
 * renderer that only handled the shapes it recognised would go blank exactly when a new publisher
 * shipped.
 */
export function describeActivityEvent(
  eventType: string,
  eventData: DiscussJson | null
): ActivityDescriptor {
  const segments = eventType.split(/[.:/]/).filter(Boolean)
  const family = (segments[0] ?? '').toLowerCase()
  const outcomeToken = (segments[segments.length - 1] ?? '').toLowerCase()
  const hasOutcome = segments.length > 1

  const base = ACTIVITY_KINDS[family] ?? ACTIVITY_FALLBACK
  const isFailure = hasOutcome && ACTIVITY_FAILURE_OUTCOMES.has(outcomeToken)
  const kind: ActivityKind = isFailure
    ? { ...base, accent: 'failure', icon: ACTIVITY_FAILURE_ICON }
    : base

  const data: Record<string, DiscussJson> = asEventObject(eventData) ?? {}

  let title: string | null = null
  for (const key of TITLE_KEYS) {
    title = asDisplayValue(data[key])
    if (title) break
  }
  if (!title) {
    title = hasOutcome
      ? `${base.label} ${outcomeToken}`
      : humaniseToken(eventType) || ACTIVITY_FALLBACK.label
  }

  let link: string | null = null
  for (const key of LINK_KEYS) {
    const candidate = asDisplayValue(data[key])
    if (candidate && /^https?:\/\//i.test(candidate)) {
      link = candidate
      break
    }
  }

  const fields: ActivityField[] = []
  const amount = formatAmount(data)
  if (amount) fields.push({ label: 'Amount', value: amount })

  for (const [key, value] of Object.entries(data)) {
    if (fields.length >= MAX_FIELDS) break
    if (HIDDEN_KEYS.has(key)) continue
    const display = asDisplayValue(value)
    if (!display) continue
    fields.push({ label: humaniseToken(key), value: display })
  }

  return {
    kind,
    accent: kind.accent,
    eyebrow: base.label,
    title,
    outcome: hasOutcome ? humaniseToken(outcomeToken) : '',
    fields,
    link,
  }
}

// ── Virtualisation ────────────────────────────────────────────────────────────────────────────

/**
 * Row height estimate for the virtualiser. A busy channel is thousands of rows, so the list is
 * windowed; `measureElement` corrects these numbers after the first paint, but a close estimate
 * keeps the scrollbar from jumping while older pages load.
 */
export function estimateRowHeight(message: DiscussMessageView, isGrouped: boolean): number {
  if (isActivityMessage(message)) {
    const fieldCount = Object.keys(asEventObject(message.event_data) ?? {}).length
    return 128 + Math.min(fieldCount, 4) * 18
  }
  const lines = Math.max(1, Math.ceil((message.body?.length ?? 0) / 90))
  const bodyHeight = lines * 22
  const chrome = isGrouped ? 8 : 30
  const threadAffordance = message.replyCount > 0 ? 28 : 0
  return bodyHeight + chrome + threadAffordance + 8
}
