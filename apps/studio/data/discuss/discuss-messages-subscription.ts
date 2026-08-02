import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
} from '@indobaseinc/indobase-js'

import { getDiscussClient, type DiscussClientVariables } from './discuss-client'
import type { DiscussMessage } from './discuss.types'

export type DiscussMessageChange = RealtimePostgresChangesPayload<DiscussMessage>

export type DiscussMessagesSubscriptionVariables = DiscussClientVariables & {
  channelId: string
  /** A new top-level message or reply arrived in this channel. */
  onInsert?: (message: DiscussMessage) => void
  /** An edit or a soft delete — check `deleted_at` before rendering. */
  onUpdate?: (message: DiscussMessage) => void
  /**
   * A hard delete (cascade from a removed channel). Only the primary key is present unless the
   * table's replica identity is FULL, so this carries a partial row.
   */
  onDelete?: (message: Partial<DiscussMessage>) => void
  onStatus?: (status: `${REALTIME_SUBSCRIBE_STATES}`, error?: Error) => void
}

/**
 * Live updates for one channel's messages.
 *
 * Realtime replays RLS for each subscriber, so a client only ever receives rows it could have
 * SELECTed — the same guarantee the database already enforces for reads, from the same policies.
 * There is no second access-control system here to drift out of sync, which is where forked chat
 * products leak.
 *
 * The `channel_id` filter is a *delivery* filter, not a security boundary: it keeps a subscriber
 * from being woken for every message in the project. Isolation is still `messages_read`.
 *
 * Returns an unsubscribe function. Call it on unmount — the socket is shared with every other
 * Discuss subscription for this project, so leaving channels open leaks server-side subscriptions.
 */
export function subscribeToDiscussMessages({
  channelId,
  onInsert,
  onUpdate,
  onDelete,
  onStatus,
  ...vars
}: DiscussMessagesSubscriptionVariables): () => void {
  const client = getDiscussClient(vars)

  const filter = `channel_id=eq.${channelId}`
  const realtimeChannel: RealtimeChannel = client
    .channel(`discuss:messages:${channelId}`)
    .on<DiscussMessage>(
      'postgres_changes',
      { event: 'INSERT', schema: 'discuss', table: 'messages', filter },
      (payload) => onInsert?.(payload.new)
    )
    .on<DiscussMessage>(
      'postgres_changes',
      { event: 'UPDATE', schema: 'discuss', table: 'messages', filter },
      (payload) => onUpdate?.(payload.new)
    )
    .on<DiscussMessage>(
      'postgres_changes',
      { event: 'DELETE', schema: 'discuss', table: 'messages', filter },
      (payload) => onDelete?.(payload.old)
    )

  realtimeChannel.subscribe((status, error) => onStatus?.(status, error))

  return () => {
    void client.removeChannel(realtimeChannel)
  }
}
