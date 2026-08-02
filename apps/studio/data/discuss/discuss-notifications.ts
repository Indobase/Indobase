import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'

import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from '@indobaseinc/indobase-js'
import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import {
  getDiscussClient,
  hasDiscussClientVariables,
  type DiscussClientVariables,
} from './discuss-client'
import { useDiscussConnection } from './discuss-connection'
import { discussKeys } from './keys'
import type { DiscussNotification } from './discuss.types'

export const DISCUSS_NOTIFICATION_COLUMNS =
  'id, member_id, project_ref, channel_id, message_id, kind, title, body, read_at, created_at'

export async function getDiscussNotifications(
  vars: DiscussClientVariables,
  signal?: AbortSignal
): Promise<DiscussNotification[]> {
  const client = getDiscussClient(vars)
  const query = client
    .from('notifications')
    .select(DISCUSS_NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)
  return (data ?? []) as DiscussNotification[]
}

export const useDiscussNotificationsQuery = <TData = DiscussNotification[]>(
  { projectRef }: { projectRef?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<DiscussNotification[], ResponseError, TData> = {}
) => {
  const { connection, isReady } = useDiscussConnection({ projectRef })

  return useQuery({
    queryKey: discussKeys.notifications(projectRef),
    queryFn: ({ signal }) => getDiscussNotifications(connection, signal),
    enabled: enabled && isReady && hasDiscussClientVariables(connection),
    refetchInterval: 30_000,
    ...options,
  })
}

export type DiscussMarkNotificationsReadVariables = DiscussClientVariables & {
  notificationIds?: string[]
  /** When true, mark every unread notification for the caller. */
  markAll?: boolean
}

export async function markDiscussNotificationsRead({
  notificationIds,
  markAll,
  ...vars
}: DiscussMarkNotificationsReadVariables): Promise<void> {
  const client = getDiscussClient(vars)
  const readAt = new Date().toISOString()

  let query = client.from('notifications').update({ read_at: readAt }).is('read_at', null)
  if (!markAll) {
    if (!notificationIds || notificationIds.length === 0) return
    query = query.in('id', notificationIds)
  }

  const { error } = await query
  if (error) handleError(error)
}

export const useDiscussMarkNotificationsReadMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<void, ResponseError, DiscussMarkNotificationsReadVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['discuss', 'mark-notifications-read'],
    mutationFn: (vars) => markDiscussNotificationsRead(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({
        queryKey: discussKeys.notifications(variables.projectRef),
      })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to update notifications: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

/** Live inserts into the caller's notification feed. */
export function useDiscussNotificationsSubscription({
  projectRef,
  enabled = true,
}: {
  projectRef?: string
  enabled?: boolean
}) {
  const queryClient = useQueryClient()
  const { connection, isReady } = useDiscussConnection({ projectRef })

  useEffect(() => {
    if (!enabled || !isReady || !hasDiscussClientVariables(connection) || !projectRef) return

    const client = getDiscussClient(connection)
    const channel: RealtimeChannel = client
      .channel(`discuss:notifications:${projectRef}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'discuss', table: 'notifications' },
        () => {
          void queryClient.invalidateQueries({ queryKey: discussKeys.notifications(projectRef) })
        }
      )

    channel.subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [connection, enabled, isReady, projectRef, queryClient])
}

export { REALTIME_SUBSCRIBE_STATES }
