import { useQuery } from '@tanstack/react-query'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import {
  getDiscussClient,
  hasDiscussClientVariables,
  type DiscussClientVariables,
} from './discuss-client'
import { useDiscussConnection } from './discuss-connection'
import { DISCUSS_MESSAGE_COLUMNS } from './discuss-messages-infinite-query'
import { discussKeys } from './keys'
import type { DiscussMessage } from './discuss.types'

/**
 * Threads are one level deep on purpose, so a thread is small enough to load in one request. This
 * cap exists to keep a pathological thread from becoming an unbounded response, not to paginate.
 */
export const DISCUSS_THREAD_LIMIT = 200

export type DiscussThreadVariables = DiscussClientVariables & { parentId?: string }

/**
 * Replies to one message, oldest first — reading order for a conversation.
 *
 * Uses `messages_thread_idx (parent_id, created_at) where deleted_at is null`. A reply never has
 * replies of its own, so there is nothing recursive here.
 */
export async function getDiscussThread(
  { parentId, ...vars }: DiscussThreadVariables,
  signal?: AbortSignal
): Promise<DiscussMessage[]> {
  if (!parentId) throw new Error('Parent message id is required')

  const client = getDiscussClient(vars)

  const query = client
    .from('messages')
    .select(DISCUSS_MESSAGE_COLUMNS)
    .eq('parent_id', parentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(DISCUSS_THREAD_LIMIT)

  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)

  return (data ?? []) as DiscussMessage[]
}

export type DiscussThreadData = DiscussMessage[]
export type DiscussThreadError = ResponseError

export const useDiscussThreadQuery = <TData = DiscussThreadData>(
  { projectRef, parentId }: { projectRef?: string; parentId?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<DiscussThreadData, DiscussThreadError, TData> = {}
) => {
  const { connection, isReady } = useDiscussConnection({ projectRef })

  return useQuery<DiscussThreadData, DiscussThreadError, TData>({
    queryKey: discussKeys.thread(projectRef, parentId),
    queryFn: ({ signal }) => getDiscussThread({ ...connection, parentId }, signal),
    enabled:
      enabled && isReady && hasDiscussClientVariables(connection) && typeof parentId === 'string',
    ...options,
  })
}
