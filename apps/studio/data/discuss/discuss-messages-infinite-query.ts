import { InfiniteData, useInfiniteQuery } from '@tanstack/react-query'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomInfiniteQueryOptions } from 'types'
import {
  getDiscussClient,
  hasDiscussClientVariables,
  type DiscussClientVariables,
} from './discuss-client'
import { useDiscussConnection } from './discuss-connection'
import { discussKeys } from './keys'
import type { DiscussMessage } from './discuss.types'

/** Never select `search_vector`; it is a generated tsvector and would bloat every page. */
export const DISCUSS_MESSAGE_COLUMNS =
  'id, channel_id, project_ref, author_id, event_type, event_data, body, parent_id, created_at, edited_at, deleted_at'

export const DISCUSS_MESSAGES_PAGE_SIZE = 50

export type DiscussMessagesVariables = DiscussClientVariables & {
  channelId?: string
  /**
   * `created_at` of the oldest row already loaded. Keyset pagination, not offset: the feed grows at
   * the head while you scroll, and offsets would skip or repeat rows as it does.
   */
  cursor?: string
}

/**
 * A page of a channel's history: newest first, top-level only.
 *
 * `parent_id is null` and `deleted_at is null` match the partial index
 * `messages_channel_created_idx (channel_id, created_at desc)`, which is the index this view exists
 * to use. `deleted_at is null` is also part of `messages_read`, so it is not doing security work
 * here — it is there so the planner picks the partial index.
 *
 * Replies are not included; use `useDiscussThreadQuery` for those. Threads are one level deep.
 */
export async function getDiscussMessages(
  { channelId, cursor, ...vars }: DiscussMessagesVariables,
  signal?: AbortSignal
): Promise<DiscussMessage[]> {
  if (!channelId) throw new Error('Channel id is required')

  const client = getDiscussClient(vars)

  let filters = client
    .from('messages')
    .select(DISCUSS_MESSAGE_COLUMNS)
    .eq('channel_id', channelId)
    .is('parent_id', null)
    .is('deleted_at', null)

  if (cursor) filters = filters.lt('created_at', cursor)

  const query = filters.order('created_at', { ascending: false }).limit(DISCUSS_MESSAGES_PAGE_SIZE)

  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)

  return (data ?? []) as DiscussMessage[]
}

export type DiscussMessagesData = DiscussMessage[]
export type DiscussMessagesError = ResponseError

export const useDiscussMessagesInfiniteQuery = <TData = DiscussMessagesData>(
  { projectRef, channelId }: { projectRef?: string; channelId?: string },
  {
    enabled = true,
    ...options
  }: UseCustomInfiniteQueryOptions<
    DiscussMessagesData,
    DiscussMessagesError,
    InfiniteData<TData>,
    readonly unknown[],
    string | undefined
  > = {}
) => {
  const { connection, isReady } = useDiscussConnection({ projectRef })

  return useInfiniteQuery({
    queryKey: discussKeys.messages(projectRef, channelId),
    queryFn: ({ pageParam, signal }) =>
      getDiscussMessages({ ...connection, channelId, cursor: pageParam }, signal),
    enabled:
      enabled && isReady && hasDiscussClientVariables(connection) && typeof channelId === 'string',
    initialPageParam: undefined as string | undefined,
    getNextPageParam(lastPage: DiscussMessagesData) {
      if (lastPage.length < DISCUSS_MESSAGES_PAGE_SIZE) return undefined
      return lastPage[lastPage.length - 1]?.created_at
    },
    ...options,
  })
}
