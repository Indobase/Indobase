import { useMutation, useQueryClient } from '@tanstack/react-query'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { getDiscussClient, type DiscussClientVariables } from './discuss-client'
import { discussKeys } from './keys'
import type { DiscussReadState, DiscussReadStateInsert } from './discuss.types'

export type DiscussMarkReadVariables = DiscussClientVariables & {
  channelId: string
  /** The caller's `discuss.members.id`, as returned by `useDiscussSetupQuery`. */
  memberId: string
  /** Defaults to now. Pass the `created_at` of the newest visible message to be exact. */
  lastReadAt?: string
}

/**
 * Moves the caller's high-water mark for a channel.
 *
 * `read_state` stores a mark rather than per-message receipts, so the table stays
 * O(members × channels) and an unread count is a single indexed `count(*)`.
 *
 * `read_state_own` is a FOR ALL policy keyed on `member_id`, so the upsert can only ever touch the
 * caller's own row — passing someone else's `member_id` is rejected by the database, not by a check
 * here.
 */
export async function markDiscussChannelRead({
  channelId,
  memberId,
  lastReadAt,
  ...vars
}: DiscussMarkReadVariables): Promise<DiscussReadState> {
  const client = getDiscussClient(vars)

  const payload: DiscussReadStateInsert = {
    channel_id: channelId,
    member_id: memberId,
    last_read_at: lastReadAt ?? new Date().toISOString(),
  }

  const { data, error } = await client
    .from('read_state')
    .upsert(payload, { onConflict: 'channel_id,member_id' })
    .select('channel_id, member_id, last_read_at')
    .single()

  if (error) handleError(error)

  return data as DiscussReadState
}

type DiscussMarkReadData = Awaited<ReturnType<typeof markDiscussChannelRead>>

export const useDiscussMarkReadMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<DiscussMarkReadData, ResponseError, DiscussMarkReadVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<DiscussMarkReadData, ResponseError, DiscussMarkReadVariables>({
    mutationKey: discussKeys.markRead(),
    mutationFn: (vars) => markDiscussChannelRead(vars),
    async onSuccess(data, variables, context) {
      // The unread counts live on the channel list, so that is what has to be refreshed.
      await queryClient.invalidateQueries({ queryKey: discussKeys.channels(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      // Deliberately silent by default: marking read is a background side effect of scrolling, and
      // a toast on every transient failure would be noise. Callers that care can pass onError.
      onError?.(data, variables, context)
    },
    ...options,
  })
}
