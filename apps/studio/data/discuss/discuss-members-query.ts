import { useQuery } from '@tanstack/react-query'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import {
  getDiscussClient,
  hasDiscussClientVariables,
  type DiscussClientVariables,
} from './discuss-client'
import { useDiscussConnection } from './discuss-connection'
import { discussKeys } from './keys'
import type { DiscussMember } from './discuss.types'

export const DISCUSS_MEMBER_COLUMNS =
  'id, gotrue_id, project_ref, email, display_name, avatar_url, role, created_at, last_seen_at'

/**
 * The people whose messages can appear in this project's channels.
 *
 * Message rows carry only `author_id`; authors are fetched once here and joined in the UI rather
 * than embedded on every message. The same handful of people write thousands of messages, so
 * embedding would repeat the same rows over the wire on every page of history.
 *
 * `members_self_project` restricts this to projects the caller belongs to.
 */
export async function getDiscussMembers(
  vars: DiscussClientVariables,
  signal?: AbortSignal
): Promise<DiscussMember[]> {
  const client = getDiscussClient(vars)

  const query = client.from('members').select(DISCUSS_MEMBER_COLUMNS).order('display_name')

  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)

  return (data ?? []) as DiscussMember[]
}

export type DiscussMembersData = DiscussMember[]
export type DiscussMembersError = ResponseError

export const useDiscussMembersQuery = <TData = DiscussMembersData>(
  { projectRef }: { projectRef?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<DiscussMembersData, DiscussMembersError, TData> = {}
) => {
  const { connection, isReady } = useDiscussConnection({ projectRef })

  return useQuery<DiscussMembersData, DiscussMembersError, TData>({
    queryKey: discussKeys.members(projectRef),
    queryFn: ({ signal }) => getDiscussMembers(connection, signal),
    enabled: enabled && isReady && hasDiscussClientVariables(connection),
    ...options,
  })
}
