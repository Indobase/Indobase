import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { getDiscussClient, type DiscussClientVariables } from './discuss-client'
import { discussKeys } from './keys'

export type DiscussCreateChannelVariables = DiscussClientVariables & {
  name: string
  topic?: string | null
  isPrivate?: boolean
}

export async function createDiscussChannel({
  name,
  topic,
  isPrivate = false,
  ...vars
}: DiscussCreateChannelVariables): Promise<string> {
  if (!vars.projectRef) throw new Error('Project ref is required')
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Channel name is required')

  const client = getDiscussClient(vars)
  const { data, error } = await client.rpc('create_channel', {
    p_project_ref: vars.projectRef,
    p_name: trimmed,
    p_topic: topic?.trim() || null,
    p_is_private: isPrivate,
  })
  if (error) handleError(error)
  if (!data) throw new Error('Channel was not created')
  return data as string
}

export type DiscussOpenDirectVariables = DiscussClientVariables & {
  otherMemberId: string
}

export async function openDiscussDirectChannel({
  otherMemberId,
  ...vars
}: DiscussOpenDirectVariables): Promise<string> {
  if (!vars.projectRef) throw new Error('Project ref is required')
  if (!otherMemberId) throw new Error('Pick someone to message')

  const client = getDiscussClient(vars)
  const { data, error } = await client.rpc('open_direct_channel', {
    p_project_ref: vars.projectRef,
    p_other_member_id: otherMemberId,
  })
  if (error) handleError(error)
  if (!data) throw new Error('Direct message was not opened')
  return data as string
}

export const useDiscussCreateChannelMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<string, ResponseError, DiscussCreateChannelVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<string, ResponseError, DiscussCreateChannelVariables>({
    mutationKey: discussKeys.createChannel(),
    mutationFn: (vars) => createDiscussChannel(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: discussKeys.channels(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to create channel: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export const useDiscussOpenDirectMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<string, ResponseError, DiscussOpenDirectVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<string, ResponseError, DiscussOpenDirectVariables>({
    mutationKey: discussKeys.openDirect(),
    mutationFn: (vars) => openDiscussDirectChannel(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: discussKeys.channels(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to open direct message: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export type DiscussOpenGroupVariables = DiscussClientVariables & {
  memberIds: string[]
  name?: string | null
}

export async function openDiscussGroupDm({
  memberIds,
  name,
  ...vars
}: DiscussOpenGroupVariables): Promise<string> {
  if (!vars.projectRef) throw new Error('Project ref is required')
  if (!memberIds.length) throw new Error('Pick at least one teammate')

  const client = getDiscussClient(vars)
  const { data, error } = await client.rpc('open_group_dm', {
    p_project_ref: vars.projectRef,
    p_member_ids: memberIds,
    p_name: name?.trim() || null,
  })
  if (error) handleError(error)
  if (!data) throw new Error('Group message was not opened')
  return data as string
}

export const useDiscussOpenGroupMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<string, ResponseError, DiscussOpenGroupVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<string, ResponseError, DiscussOpenGroupVariables>({
    mutationKey: discussKeys.openGroupDm(),
    mutationFn: (vars) => openDiscussGroupDm(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: discussKeys.channels(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to open group message: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export type DiscussArchiveChannelVariables = DiscussClientVariables & {
  channelId: string
  archived: boolean
}

export async function setDiscussChannelArchived({
  channelId,
  archived,
  ...vars
}: DiscussArchiveChannelVariables): Promise<string> {
  const client = getDiscussClient(vars)
  const { data, error } = await client.rpc(archived ? 'archive_channel' : 'unarchive_channel', {
    p_channel_id: channelId,
  })
  if (error) handleError(error)
  if (!data) throw new Error(archived ? 'Channel was not archived' : 'Channel was not restored')
  return data as string
}

export const useDiscussArchiveChannelMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<string, ResponseError, DiscussArchiveChannelVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<string, ResponseError, DiscussArchiveChannelVariables>({
    mutationKey: discussKeys.archiveChannel(),
    mutationFn: (vars) => setDiscussChannelArchived(vars),
    async onSuccess(data, variables, context) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discussKeys.channels(variables.projectRef) }),
        queryClient.invalidateQueries({
          queryKey: discussKeys.archivedChannels(variables.projectRef),
        }),
      ])
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(
          `Failed to ${variables.archived ? 'archive' : 'unarchive'} channel: ${data.message}`
        )
      } else onError(data, variables, context)
    },
    ...options,
  })
}
