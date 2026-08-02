import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import { getDiscussClient, hasDiscussClientVariables, type DiscussClientVariables } from './discuss-client'
import { useDiscussConnection } from './discuss-connection'
import { discussKeys } from './keys'
import type { DiscussReactionCount } from './discuss.types'

export async function getDiscussReactionCounts(
  vars: DiscussClientVariables & { messageIds: string[] },
  signal?: AbortSignal
): Promise<DiscussReactionCount[]> {
  if (vars.messageIds.length === 0) return []
  const client = getDiscussClient(vars)
  const query = client.rpc('reaction_counts', { p_message_ids: vars.messageIds })
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)
  return ((data ?? []) as DiscussReactionCount[]).map((row) => ({
    ...row,
    count: Number(row.count ?? 0),
    reacted_by_me: Boolean(row.reacted_by_me),
  }))
}

export const useDiscussReactionCountsQuery = <TData = DiscussReactionCount[]>(
  {
    projectRef,
    channelId,
    messageIds,
  }: {
    projectRef?: string
    channelId?: string
    messageIds: string[]
  },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<DiscussReactionCount[], ResponseError, TData> = {}
) => {
  const { connection, isReady } = useDiscussConnection({ projectRef })
  const sortedKey = [...messageIds].sort().join(',')

  return useQuery<DiscussReactionCount[], ResponseError, TData>({
    queryKey: [...discussKeys.reactions(projectRef, channelId), sortedKey],
    queryFn: ({ signal }) => getDiscussReactionCounts({ ...connection, messageIds }, signal),
    enabled:
      enabled &&
      isReady &&
      hasDiscussClientVariables(connection) &&
      typeof channelId === 'string' &&
      messageIds.length > 0,
    staleTime: 15_000,
    ...options,
  })
}

export type DiscussToggleReactionVariables = DiscussClientVariables & {
  channelId: string
  messageId: string
  memberId: string
  emoji: string
  /** When true, remove the reaction; otherwise add. */
  remove?: boolean
}

export async function toggleDiscussReaction({
  messageId,
  memberId,
  emoji,
  remove = false,
  ...vars
}: DiscussToggleReactionVariables) {
  const client = getDiscussClient(vars)
  if (remove) {
    const { error } = await client
      .from('reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('member_id', memberId)
      .eq('emoji', emoji)
    if (error) handleError(error)
    return
  }

  const { error } = await client.from('reactions').insert({
    message_id: messageId,
    member_id: memberId,
    emoji,
  })
  if (error) handleError(error)
}

export const useDiscussToggleReactionMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<void, ResponseError, DiscussToggleReactionVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<void, ResponseError, DiscussToggleReactionVariables>({
    mutationKey: discussKeys.toggleReaction(),
    mutationFn: (vars) => toggleDiscussReaction(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({
        queryKey: discussKeys.reactions(variables.projectRef, variables.channelId),
      })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to update reaction: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}
