import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { getDiscussClient, type DiscussClientVariables } from './discuss-client'
import { DISCUSS_MESSAGE_COLUMNS } from './discuss-messages-infinite-query'
import { discussKeys } from './keys'
import type { DiscussMessage } from './discuss.types'

export type DiscussEditMessageVariables = DiscussClientVariables & {
  channelId: string
  messageId: string
  body: string
}

export async function editDiscussMessage({
  messageId,
  body,
  ...vars
}: DiscussEditMessageVariables): Promise<DiscussMessage> {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Message body is required')

  const client = getDiscussClient(vars)
  const { data, error } = await client
    .from('messages')
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(DISCUSS_MESSAGE_COLUMNS)
    .single()

  if (error) handleError(error)
  return data as DiscussMessage
}

export type DiscussDeleteMessageVariables = DiscussClientVariables & {
  channelId: string
  messageId: string
  parentId?: string | null
}

/** Soft-delete. `messages_read` hides rows with `deleted_at` set. */
export async function deleteDiscussMessage({
  messageId,
  ...vars
}: DiscussDeleteMessageVariables): Promise<void> {
  const client = getDiscussClient(vars)
  const { error } = await client
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)

  if (error) handleError(error)
}

export const useDiscussEditMessageMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<DiscussMessage, ResponseError, DiscussEditMessageVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<DiscussMessage, ResponseError, DiscussEditMessageVariables>({
    mutationKey: discussKeys.editMessage(),
    mutationFn: (vars) => editDiscussMessage(vars),
    async onSuccess(data, variables, context) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: discussKeys.messages(variables.projectRef, variables.channelId),
        }),
        data.parent_id
          ? queryClient.invalidateQueries({
              queryKey: discussKeys.thread(variables.projectRef, data.parent_id),
            })
          : Promise.resolve(),
      ])
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to edit message: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export const useDiscussDeleteMessageMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<void, ResponseError, DiscussDeleteMessageVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<void, ResponseError, DiscussDeleteMessageVariables>({
    mutationKey: discussKeys.deleteMessage(),
    mutationFn: (vars) => deleteDiscussMessage(vars),
    async onSuccess(data, variables, context) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: discussKeys.messages(variables.projectRef, variables.channelId),
        }),
        queryClient.invalidateQueries({ queryKey: discussKeys.channels(variables.projectRef) }),
        variables.parentId
          ? queryClient.invalidateQueries({
              queryKey: discussKeys.thread(variables.projectRef, variables.parentId),
            })
          : Promise.resolve(),
      ])
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to delete message: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}
