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
import type { DiscussChannel, DiscussChannelWithUnread, DiscussUnreadCount } from './discuss.types'

export const DISCUSS_CHANNEL_COLUMNS =
  'id, project_ref, slug, name, topic, kind, is_private, created_by, created_at, archived_at'

export async function getDiscussChannels(
  vars: DiscussClientVariables,
  signal?: AbortSignal
): Promise<DiscussChannelWithUnread[]> {
  const client = getDiscussClient(vars)

  const channelsQuery = client
    .from('channels')
    .select(DISCUSS_CHANNEL_COLUMNS)
    .is('archived_at', null)
    .order('name')

  const { data: channels, error: channelsError } = await (signal
    ? channelsQuery.abortSignal(signal)
    : channelsQuery)
  if (channelsError) handleError(channelsError)

  const { data: unreadRows, error: unreadError } = await client.rpc('unread_counts')
  if (unreadError) handleError(unreadError)

  const unreadByChannel = new Map<string, DiscussUnreadCount>()
  for (const row of (unreadRows ?? []) as DiscussUnreadCount[]) {
    unreadByChannel.set(row.channel_id, row)
  }

  return ((channels ?? []) as DiscussChannel[]).map((channel) => {
    const unread = unreadByChannel.get(channel.id)
    return {
      ...channel,
      unread: Number(unread?.unread ?? 0),
      last_message_at: unread?.last_message_at ?? null,
    }
  })
}

export async function getDiscussArchivedChannels(
  vars: DiscussClientVariables,
  signal?: AbortSignal
): Promise<DiscussChannelWithUnread[]> {
  const client = getDiscussClient(vars)

  const channelsQuery = client
    .from('channels')
    .select(DISCUSS_CHANNEL_COLUMNS)
    .not('archived_at', 'is', null)
    .order('name')

  const { data: channels, error } = await (signal
    ? channelsQuery.abortSignal(signal)
    : channelsQuery)
  if (error) handleError(error)

  return ((channels ?? []) as DiscussChannel[]).map((channel) => ({
    ...channel,
    unread: 0,
    last_message_at: null,
  }))
}

export type DiscussChannelsData = DiscussChannelWithUnread[]
export type DiscussChannelsError = ResponseError

export const useDiscussChannelsQuery = <TData = DiscussChannelsData>(
  { projectRef }: { projectRef?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<DiscussChannelsData, DiscussChannelsError, TData> = {}
) => {
  const { connection, isReady } = useDiscussConnection({ projectRef })

  return useQuery<DiscussChannelsData, DiscussChannelsError, TData>({
    queryKey: discussKeys.channels(projectRef),
    queryFn: ({ signal }) => getDiscussChannels(connection, signal),
    enabled: enabled && isReady && hasDiscussClientVariables(connection),
    ...options,
  })
}

export const useDiscussArchivedChannelsQuery = <TData = DiscussChannelsData>(
  { projectRef }: { projectRef?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<DiscussChannelsData, DiscussChannelsError, TData> = {}
) => {
  const { connection, isReady } = useDiscussConnection({ projectRef })

  return useQuery<DiscussChannelsData, DiscussChannelsError, TData>({
    queryKey: discussKeys.archivedChannels(projectRef),
    queryFn: ({ signal }) => getDiscussArchivedChannels(connection, signal),
    enabled: enabled && isReady && hasDiscussClientVariables(connection),
    staleTime: 60_000,
    ...options,
  })
}
