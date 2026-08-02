import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import {
  getDiscussClient,
  hasDiscussClientVariables,
  type DiscussClientVariables,
} from './discuss-client'
import { useDiscussConnection } from './discuss-connection'
import { discussKeys } from './keys'
import type { DiscussAttachment } from './discuss.types'
import {
  DISCUSS_MAX_UPLOAD_FILES,
  insertDiscussAttachment,
  uploadDiscussFile,
} from './discuss-upload'
import { DISCUSS_MESSAGE_COLUMNS } from './discuss-messages-infinite-query'
import type { DiscussMessage, DiscussMessageInsert } from './discuss.types'
import { sendDiscussMessage } from './discuss-send-message-mutation'

export const DISCUSS_ATTACHMENT_COLUMNS =
  'id, message_id, storage_path, file_name, mime_type, size_bytes, created_at'

export async function getDiscussAttachmentsForMessages({
  messageIds,
  ...vars
}: DiscussClientVariables & { messageIds: string[] }): Promise<DiscussAttachment[]> {
  if (messageIds.length === 0) return []
  const client = getDiscussClient(vars)
  const { data, error } = await client
    .from('attachments')
    .select(DISCUSS_ATTACHMENT_COLUMNS)
    .in('message_id', messageIds)
  if (error) handleError(error)
  return (data ?? []) as DiscussAttachment[]
}

export const useDiscussAttachmentsQuery = (
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
  }: UseCustomQueryOptions<DiscussAttachment[], ResponseError> = {}
) => {
  const { connection, isReady } = useDiscussConnection({ projectRef })
  const key = messageIds.slice().sort().join(',')

  return useQuery({
    queryKey: [...discussKeys.attachments(projectRef, channelId), key],
    queryFn: () => getDiscussAttachmentsForMessages({ ...connection, messageIds }),
    enabled:
      enabled &&
      isReady &&
      hasDiscussClientVariables(connection) &&
      typeof channelId === 'string' &&
      messageIds.length > 0,
    staleTime: 30_000,
    ...options,
  })
}

export type DiscussSendWithFilesVariables = DiscussClientVariables & {
  channelId: string
  authorId: string
  body: string
  parentId?: string | null
  files?: File[]
}

/**
 * Send a message and optionally upload attachments into Storage + `discuss.attachments`.
 * Caption may be empty when at least one file is attached — we fall back to the first file name
 * so the message_has_content check still passes.
 */
export async function sendDiscussMessageWithFiles({
  channelId,
  authorId,
  body,
  parentId,
  files = [],
  ...vars
}: DiscussSendWithFilesVariables): Promise<DiscussMessage> {
  if (files.length > DISCUSS_MAX_UPLOAD_FILES) {
    throw new Error(`You can attach at most ${DISCUSS_MAX_UPLOAD_FILES} files`)
  }

  const trimmed = body.trim()
  if (!trimmed && files.length === 0) throw new Error('Message body is required')

  if (files.length === 0) {
    return sendDiscussMessage({
      ...vars,
      channelId,
      authorId,
      body: trimmed,
      parentId,
    })
  }

  if (!vars.gotrueId) throw new Error('You must be signed in to upload files')

  const client = getDiscussClient(vars)
  const payload: DiscussMessageInsert = {
    channel_id: channelId,
    author_id: authorId,
    body: trimmed || files[0]!.name,
    parent_id: parentId ?? null,
  }

  const { data, error } = await client
    .from('messages')
    .insert(payload)
    .select(DISCUSS_MESSAGE_COLUMNS)
    .single()
  if (error) handleError(error)

  const message = data as DiscussMessage

  for (const file of files) {
    const upload = await uploadDiscussFile({
      ...vars,
      gotrueId: vars.gotrueId,
      messageId: message.id,
      file,
    })
    await insertDiscussAttachment({
      ...vars,
      messageId: message.id,
      upload,
    })
  }

  return message
}

export const useDiscussSendMessageWithFilesMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<DiscussMessage, ResponseError, DiscussSendWithFilesVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<DiscussMessage, ResponseError, DiscussSendWithFilesVariables>({
    mutationKey: discussKeys.sendMessage(),
    mutationFn: (vars) => sendDiscussMessageWithFiles(vars),
    async onSuccess(data, variables, context) {
      const { projectRef, channelId, parentId } = variables
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discussKeys.messages(projectRef, channelId) }),
        queryClient.invalidateQueries({ queryKey: discussKeys.channels(projectRef) }),
        queryClient.invalidateQueries({ queryKey: discussKeys.attachments(projectRef, channelId) }),
        ...(parentId
          ? [queryClient.invalidateQueries({ queryKey: discussKeys.thread(projectRef, parentId) })]
          : []),
      ])
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to send message: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}
