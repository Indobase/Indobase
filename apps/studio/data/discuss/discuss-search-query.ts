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

export const DISCUSS_SEARCH_LIMIT = 50

export type DiscussSearchVariables = DiscussClientVariables & {
  query?: string
  /** Optional: restrict to one channel. Omit to search everything the caller can read. */
  channelId?: string
}

/**
 * Full-text search over message bodies.
 *
 * Filters on the generated `search_vector` column so the query uses `messages_search_idx`, the GIN
 * index that exists for exactly this. `websearch` parsing is what users expect from a search box:
 * quoted phrases, `or`, and leading `-` for exclusion.
 *
 * The `english` config matches the one the generated column was built with — a mismatch here would
 * silently return nothing for stemmed words.
 *
 * Results are scoped by `messages_read`, so search can never surface a message from a channel the
 * caller is not in. That is the whole point of putting search in the database rather than in an
 * external index that would need its own copy of the permission model.
 */
export async function searchDiscussMessages(
  { query, channelId, ...vars }: DiscussSearchVariables,
  signal?: AbortSignal
): Promise<DiscussMessage[]> {
  const term = query?.trim()
  if (!term) return []

  const client = getDiscussClient(vars)

  let filters = client
    .from('messages')
    .select(DISCUSS_MESSAGE_COLUMNS)
    .textSearch('search_vector', term, { type: 'websearch', config: 'english' })
    .is('deleted_at', null)

  if (channelId) filters = filters.eq('channel_id', channelId)

  const builder = filters.order('created_at', { ascending: false }).limit(DISCUSS_SEARCH_LIMIT)

  const { data, error } = await (signal ? builder.abortSignal(signal) : builder)
  if (error) handleError(error)

  return (data ?? []) as DiscussMessage[]
}

export type DiscussSearchData = DiscussMessage[]
export type DiscussSearchError = ResponseError

export const useDiscussSearchQuery = <TData = DiscussSearchData>(
  { projectRef, query, channelId }: { projectRef?: string; query?: string; channelId?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<DiscussSearchData, DiscussSearchError, TData> = {}
) => {
  const { connection, isReady } = useDiscussConnection({ projectRef })
  const term = query?.trim() ?? ''

  return useQuery<DiscussSearchData, DiscussSearchError, TData>({
    queryKey: discussKeys.search(projectRef, term, channelId),
    queryFn: ({ signal }) =>
      searchDiscussMessages({ ...connection, query: term, channelId }, signal),
    enabled: enabled && isReady && hasDiscussClientVariables(connection) && term.length > 0,
    ...options,
  })
}
