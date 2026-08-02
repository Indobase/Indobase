import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { getDiscussClient, type DiscussClientVariables } from './discuss-client'
import { DISCUSS_MESSAGE_COLUMNS } from './discuss-messages-infinite-query'
import { discussKeys } from './keys'
import type { DiscussMessage, DiscussMessageInsert } from './discuss.types'

export type DiscussSendMessageVariables = DiscussClientVariables & {
  channelId: string
  /** The caller's `discuss.members.id`, as returned by `useDiscussSetupQuery`. */
  authorId: string
  body: string
  /** Set to reply in a thread. Threads are one level deep — never pass a reply's id. */
  parentId?: string | null
}

/**
 * Posts a message.
 *
 * `project_ref` is not set here and cannot be: the `messages_set_project_ref` trigger derives it
 * from the channel, and `DiscussMessageInsert` types the column as `never` so application code can
 * never disagree with it. RLS on messages trusts that column, so a writable one would turn any bug
 * into a cross-tenant leak.
 *
 * Authorisation is not re-implemented here either. `messages_write` requires the author to be the
 * caller, to be a member of the channel, and to not be a `viewer`. A viewer's insert fails at the
 * database, which is the only place that decision is safe to make.
 */
export async function sendDiscussMessage({
  channelId,
  authorId,
  body,
  parentId,
  ...vars
}: DiscussSendMessageVariables): Promise<DiscussMessage> {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Message body is required')

  const client = getDiscussClient(vars)

  const payload: DiscussMessageInsert = {
    channel_id: channelId,
    author_id: authorId,
    body: trimmed,
    parent_id: parentId ?? null,
  }

  const { data, error } = await client
    .from('messages')
    .insert(payload)
    .select(DISCUSS_MESSAGE_COLUMNS)
    .single()

  if (error) handleError(error)

  return data as DiscussMessage
}

type DiscussSendMessageData = Awaited<ReturnType<typeof sendDiscussMessage>>

export const useDiscussSendMessageMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<DiscussSendMessageData, ResponseError, DiscussSendMessageVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<DiscussSendMessageData, ResponseError, DiscussSendMessageVariables>({
    mutationKey: discussKeys.sendMessage(),
    mutationFn: (vars) => sendDiscussMessage(vars),
    async onSuccess(data, variables, context) {
      const { projectRef, channelId, parentId } = variables

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discussKeys.messages(projectRef, channelId) }),
        queryClient.invalidateQueries({ queryKey: discussKeys.channels(projectRef) }),
        ...(parentId
          ? [queryClient.invalidateQueries({ queryKey: discussKeys.thread(projectRef, parentId) })]
          : []),
      ])

      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to send message: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
