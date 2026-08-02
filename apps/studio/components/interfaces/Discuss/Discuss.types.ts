import type {
  DiscussAttachment,
  DiscussJson,
  DiscussMember,
  DiscussMessage,
  DiscussReactionCount,
} from 'data/discuss/discuss.types'

/**
 * View models for the Discuss surface.
 *
 * The row types in `data/discuss/discuss.types` mirror the tables exactly, which is right for the
 * data layer and not quite enough for rendering: `discuss.messages` stores `author_id`, not a name,
 * and it stores no reply count at all. Rather than denormalise the schema or make the transcript
 * issue a query per row, the container resolves both once and hands the list these views.
 *
 * Deliberately additive — a view is the row plus presentation facts, never a rewrite of it.
 */
export type DiscussAuthor = Pick<DiscussMember, 'id' | 'display_name' | 'avatar_url'>

export type DiscussReactionBucket = {
  emoji: string
  count: number
  reactedByMe: boolean
}

export type DiscussMessageView = DiscussMessage & {
  /** Null when the author row is gone (`author_id` is ON DELETE SET NULL) or for platform events. */
  author: DiscussAuthor | null
  /** One level deep, so this is a count of direct children and nothing more. */
  replyCount: number
  reactions: DiscussReactionBucket[]
  attachments: DiscussAttachment[]
}

/** `event_data` is arbitrary jsonb; only an object can be rendered as fields. */
export function asEventObject(data: DiscussJson | null): Record<string, DiscussJson> | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  return data as Record<string, DiscussJson>
}

export function groupReactionCounts(
  rows: DiscussReactionCount[] | undefined
): Map<string, DiscussReactionBucket[]> {
  const map = new Map<string, DiscussReactionBucket[]>()
  for (const row of rows ?? []) {
    const list = map.get(row.message_id) ?? []
    list.push({
      emoji: row.emoji,
      count: Number(row.count),
      reactedByMe: Boolean(row.reacted_by_me),
    })
    map.set(row.message_id, list)
  }
  return map
}

export function toMessageViews(
  messages: DiscussMessage[],
  membersById: Map<string, DiscussMember>,
  replyCounts: Map<string, number>,
  reactionsByMessage: Map<string, DiscussReactionBucket[]> = new Map(),
  attachmentsByMessage: Map<string, DiscussAttachment[]> = new Map()
): DiscussMessageView[] {
  return messages.map((message) => {
    const member = message.author_id ? membersById.get(message.author_id) : undefined
    return {
      ...message,
      author: member
        ? { id: member.id, display_name: member.display_name, avatar_url: member.avatar_url }
        : null,
      replyCount: replyCounts.get(message.id) ?? 0,
      reactions: reactionsByMessage.get(message.id) ?? [],
      attachments: attachmentsByMessage.get(message.id) ?? [],
    }
  })
}
