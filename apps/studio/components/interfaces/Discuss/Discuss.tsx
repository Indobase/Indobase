import { useParams } from 'common'
import { Archive, ArchiveRestore, Hash, Lock, Radio, Search, UserRound, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  useDiscussAttachmentsQuery,
  useDiscussSendMessageWithFilesMutation,
} from 'data/discuss/discuss-attachments'
import {
  useDiscussArchiveChannelMutation,
  useDiscussCreateChannelMutation,
  useDiscussOpenDirectMutation,
  useDiscussOpenGroupMutation,
} from 'data/discuss/discuss-channel-mutations'
import {
  useDiscussArchivedChannelsQuery,
  useDiscussChannelsQuery,
} from 'data/discuss/discuss-channels-query'
import { useDiscussBootstrapQuery } from 'data/discuss/discuss-bootstrap-query'
import { useDiscussConnection } from 'data/discuss/discuss-connection'
import { useDiscussMarkReadMutation } from 'data/discuss/discuss-mark-read-mutation'
import { useDiscussMembersQuery } from 'data/discuss/discuss-members-query'
import {
  useDiscussDeleteMessageMutation,
  useDiscussEditMessageMutation,
} from 'data/discuss/discuss-message-mutations'
import { useDiscussMessagesInfiniteQuery } from 'data/discuss/discuss-messages-infinite-query'
import { subscribeToDiscussMessages } from 'data/discuss/discuss-messages-subscription'
import {
  useDiscussMarkNotificationsReadMutation,
  useDiscussNotificationsQuery,
  useDiscussNotificationsSubscription,
} from 'data/discuss/discuss-notifications'
import { useDiscussPresenceTyping } from 'data/discuss/discuss-presence'
import {
  useDiscussReactionCountsQuery,
  useDiscussToggleReactionMutation,
} from 'data/discuss/discuss-reactions-query'
import { discussKeys } from 'data/discuss/keys'
import type { DiscussAttachment, DiscussChannelWithUnread, DiscussMember } from 'data/discuss/discuss.types'
import { Button, cn } from 'ui'

import { ChannelSidebar } from './ChannelSidebar'
import { Composer } from './Composer'
import { CreateChannelDialog } from './CreateChannelDialog'
import { groupReactionCounts, toMessageViews, type DiscussMessageView } from './Discuss.types'
import {
  directChannelLabel,
  flattenMessagePages,
  isReadOnlyRole,
  sortChannels,
} from './Discuss.utils'
import {
  ChannelSidebarSkeleton,
  DiscussErrorState,
  DiscussLoadingState,
  MessageListSkeleton,
  NoChannelsState,
} from './DiscussStates'
import { MessageList } from './MessageList'
import { NotificationsMenu } from './NotificationsMenu'
import { SearchPanel } from './SearchPanel'
import { StartDmDialog } from './StartDmDialog'
import { ThreadPanel } from './ThreadPanel'
import { DISCUSS_FOCUS_RING } from './Discuss.constants'

const ICON_FOR_KIND = {
  standard: Hash,
  activity: Radio,
  direct: UserRound,
  group: Users,
} as const

const pickDefaultChannel = (channels: DiscussChannelWithUnread[]) => {
  const ordered = sortChannels(channels)
  return ordered.find((channel) => channel.slug === 'general') ?? ordered[0] ?? null
}

export const Discuss = () => {
  const { ref: projectRef } = useParams()
  const queryClient = useQueryClient()
  const { connection } = useDiscussConnection({ projectRef })

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [threadRoot, setThreadRoot] = useState<DiscussMessageView | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [dmOpen, setDmOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [replyCounts, setReplyCounts] = useState<Map<string, number>>(() => new Map())
  const threadOpenerRef = useRef<HTMLElement | null>(null)
  const lastMarkedRef = useRef<string | null>(null)

  const bootstrap = useDiscussBootstrapQuery({ projectRef })

  const channelsQuery = useDiscussChannelsQuery(
    { projectRef },
    {
      enabled: bootstrap.isSuccess,
      initialData: bootstrap.data?.channels,
      refetchInterval: 15_000,
    }
  )

  const archivedQuery = useDiscussArchivedChannelsQuery(
    { projectRef },
    { enabled: bootstrap.isSuccess && showArchived }
  )

  const membersQuery = useDiscussMembersQuery(
    { projectRef },
    {
      enabled: bootstrap.isSuccess,
      initialData: bootstrap.data?.members,
      staleTime: 60_000,
    }
  )

  const notificationsQuery = useDiscussNotificationsQuery(
    { projectRef },
    { enabled: bootstrap.isSuccess }
  )
  useDiscussNotificationsSubscription({ projectRef, enabled: bootstrap.isSuccess })

  const channels = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data])
  const archivedChannels = useMemo(() => archivedQuery.data ?? [], [archivedQuery.data])
  const members = useMemo(
    () => membersQuery.data ?? bootstrap.data?.members ?? [],
    [membersQuery.data, bootstrap.data?.members]
  )
  const member = bootstrap.data?.member

  const membersById = useMemo(() => {
    const map = new Map<string, DiscussMember>()
    for (const row of members) map.set(row.id, row)
    return map
  }, [members])

  useEffect(() => {
    if (channels.length === 0 && archivedChannels.length === 0) return
    setSelectedChannelId((current) => {
      if (current && channels.some((channel) => channel.id === current)) return current
      if (current && archivedChannels.some((channel) => channel.id === current)) return current
      return pickDefaultChannel(channels)?.id ?? null
    })
  }, [channels, archivedChannels])

  const selectedChannel =
    channels.find((channel) => channel.id === selectedChannelId) ??
    archivedChannels.find((channel) => channel.id === selectedChannelId) ??
    null

  const messagesQuery = useDiscussMessagesInfiniteQuery({
    projectRef,
    channelId: selectedChannel?.id,
  })

  const messages = useMemo(
    () => flattenMessagePages(messagesQuery.data?.pages),
    [messagesQuery.data?.pages]
  )

  const messageIds = useMemo(() => messages.map((message) => message.id), [messages])
  const reactionsQuery = useDiscussReactionCountsQuery({
    projectRef,
    channelId: selectedChannel?.id,
    messageIds,
  })
  const attachmentsQuery = useDiscussAttachmentsQuery({
    projectRef,
    channelId: selectedChannel?.id,
    messageIds,
  })

  const reactionsByMessage = useMemo(
    () => groupReactionCounts(reactionsQuery.data),
    [reactionsQuery.data]
  )

  const attachmentsByMessage = useMemo(() => {
    const map = new Map<string, DiscussAttachment[]>()
    for (const row of attachmentsQuery.data ?? []) {
      const list = map.get(row.message_id) ?? []
      list.push(row)
      map.set(row.message_id, list)
    }
    return map
  }, [attachmentsQuery.data])

  const messageViews = useMemo(
    () =>
      toMessageViews(
        messages,
        membersById,
        replyCounts,
        reactionsByMessage,
        attachmentsByMessage
      ),
    [messages, membersById, replyCounts, reactionsByMessage, attachmentsByMessage]
  )

  const { mutate: markRead } = useDiscussMarkReadMutation()
  const { mutateAsync: sendMessage, isPending: isSending } = useDiscussSendMessageWithFilesMutation({
    onError: (error) => setSendError(error.message),
  })
  const { mutateAsync: editMessage } = useDiscussEditMessageMutation()
  const { mutate: deleteMessage } = useDiscussDeleteMessageMutation()
  const { mutate: toggleReaction } = useDiscussToggleReactionMutation()
  const { mutateAsync: createChannel, isPending: isCreatingChannel } =
    useDiscussCreateChannelMutation()
  const { mutateAsync: openDirect, isPending: isOpeningDm } = useDiscussOpenDirectMutation()
  const { mutateAsync: openGroup, isPending: isOpeningGroup } = useDiscussOpenGroupMutation()
  const { mutateAsync: setArchived, isPending: isArchiving } = useDiscussArchiveChannelMutation()
  const { mutate: markNotificationsRead } = useDiscussMarkNotificationsReadMutation()

  const presence = useDiscussPresenceTyping({
    ...connection,
    channelId: selectedChannel?.id,
    memberId: member?.id,
    displayName: member?.display_name,
    enabled: Boolean(selectedChannel && member && selectedChannel.kind !== 'activity'),
  })

  useEffect(() => {
    if (!projectRef || !selectedChannel || !connection.gotrueId) return
    if (!connection.endpoint || !connection.apiKey) return

    return subscribeToDiscussMessages({
      ...connection,
      channelId: selectedChannel.id,
      onInsert: (message) => {
        if (message.parent_id) {
          setReplyCounts((prev) => {
            const next = new Map(prev)
            next.set(message.parent_id!, (next.get(message.parent_id!) ?? 0) + 1)
            return next
          })
          void queryClient.invalidateQueries({
            queryKey: discussKeys.thread(projectRef, message.parent_id),
          })
        } else {
          void queryClient.invalidateQueries({
            queryKey: discussKeys.messages(projectRef, selectedChannel.id),
          })
          void queryClient.invalidateQueries({ queryKey: discussKeys.channels(projectRef) })
          void queryClient.invalidateQueries({
            queryKey: discussKeys.attachments(projectRef, selectedChannel.id),
          })
        }
      },
      onUpdate: () => {
        void queryClient.invalidateQueries({
          queryKey: discussKeys.messages(projectRef, selectedChannel.id),
        })
      },
    })
  }, [projectRef, selectedChannel, connection, queryClient])

  useEffect(() => {
    if (!projectRef || !selectedChannel || !member) return
    const newest = messages[messages.length - 1]
    if (!newest) return

    const marker = `${selectedChannel.id}:${newest.created_at}`
    if (lastMarkedRef.current === marker) return
    lastMarkedRef.current = marker

    markRead({
      ...connection,
      channelId: selectedChannel.id,
      memberId: member.id,
      lastReadAt: newest.created_at,
    })
  }, [projectRef, selectedChannel, messages, markRead, member, connection])

  const openThread = useCallback((message: DiscussMessageView) => {
    const active = document.activeElement
    threadOpenerRef.current = active instanceof HTMLElement ? active : null
    setSearchOpen(false)
    setThreadRoot(message)
  }, [])

  const closeThread = useCallback(() => {
    setThreadRoot(null)
    threadOpenerRef.current?.focus()
    threadOpenerRef.current = null
  }, [])

  useEffect(() => {
    setThreadRoot(null)
    setSendError(null)
    setReplyCounts(new Map())
  }, [selectedChannelId])

  if (!projectRef) {
    return <DiscussErrorState subject="Discuss" error={{ message: 'No project selected' }} />
  }

  if (bootstrap.isPending) {
    return <DiscussLoadingState label="Opening Discuss…" />
  }

  if (bootstrap.isError) {
    return (
      <DiscussErrorState
        projectRef={projectRef}
        subject="Failed to open Indobase Discuss"
        error={bootstrap.error}
        onRetry={() => void bootstrap.refetch()}
      />
    )
  }

  if (channels.length === 0 && !channelsQuery.isPending) {
    return <NoChannelsState onRetry={() => void bootstrap.refetch()} />
  }

  const ChannelIcon = selectedChannel
    ? selectedChannel.is_private && selectedChannel.kind === 'standard'
      ? Lock
      : ICON_FOR_KIND[selectedChannel.kind]
    : Hash
  const readOnly = isReadOnlyRole(member?.role ?? bootstrap.data?.role)
  const canManage = !readOnly
  const canArchive =
    canManage &&
    (member?.role === 'owner' || member?.role === 'admin' || member?.role === 'developer')
  const channelTitle = selectedChannel
    ? directChannelLabel(selectedChannel, members, member?.id)
    : 'Discuss'
  const isArchived = Boolean(selectedChannel?.archived_at)

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex w-60 shrink-0 flex-col border-r bg-surface-100">
        {channelsQuery.isPending ? (
          <ChannelSidebarSkeleton />
        ) : channelsQuery.isError ? (
          <DiscussErrorState
            projectRef={projectRef}
            subject="Failed to load Discuss channels"
            error={channelsQuery.error}
            onRetry={() => void channelsQuery.refetch()}
          />
        ) : (
          <ChannelSidebar
            channels={channels}
            archivedChannels={archivedChannels}
            members={members}
            currentMemberId={member?.id}
            selectedChannelId={selectedChannelId}
            canManage={canManage}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived((value) => !value)}
            onSelect={setSelectedChannelId}
            onCreateChannel={() => setCreateOpen(true)}
            onStartDm={() => setDmOpen(true)}
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <ChannelIcon
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className="shrink-0 text-foreground-light"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium text-foreground">{channelTitle}</h1>
            {presence.online.length > 0 ? (
              <p className="truncate text-[11px] text-foreground-lighter">
                {presence.online.length} online
                {presence.online
                  .slice(0, 3)
                  .map((row) => row.displayName)
                  .join(', ')
                  ? ` · ${presence.online
                      .slice(0, 3)
                      .map((row) => row.displayName)
                      .join(', ')}${presence.online.length > 3 ? '…' : ''}`
                  : ''}
              </p>
            ) : null}
          </div>
          {selectedChannel?.topic ? (
            <p className="hidden max-w-[30%] truncate text-xs text-foreground-light md:block">
              {selectedChannel.topic}
            </p>
          ) : null}
          {isArchived ? (
            <span className="rounded-md border px-1.5 py-0.5 text-[11px] text-foreground-light">
              Archived
            </span>
          ) : null}
          {canArchive && selectedChannel && selectedChannel.kind !== 'activity' ? (
            <Button
              type="text"
              size="tiny"
              loading={isArchiving}
              aria-label={isArchived ? 'Unarchive channel' : 'Archive channel'}
              icon={isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              className={DISCUSS_FOCUS_RING}
              onClick={() => {
                void setArchived({
                  ...connection,
                  channelId: selectedChannel.id,
                  archived: !isArchived,
                }).then(() => {
                  if (!isArchived) {
                    setSelectedChannelId(pickDefaultChannel(channels)?.id ?? null)
                    setShowArchived(true)
                  }
                })
              }}
            />
          ) : null}
          <NotificationsMenu
            notifications={notificationsQuery.data ?? []}
            onOpenChannel={(channelId) => {
              setSelectedChannelId(channelId)
              markNotificationsRead({ ...connection, markAll: true })
            }}
            onMarkAllRead={() => markNotificationsRead({ ...connection, markAll: true })}
          />
          <Button
            type="text"
            size="tiny"
            aria-label="Search messages"
            icon={<Search size={14} />}
            className={DISCUSS_FOCUS_RING}
            onClick={() => {
              setThreadRoot(null)
              setSearchOpen((open) => !open)
            }}
          />
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {!selectedChannel ? (
              <DiscussLoadingState label="Choosing a channel…" />
            ) : messagesQuery.isPending ? (
              <MessageListSkeleton />
            ) : messagesQuery.isError ? (
              <DiscussErrorState
                projectRef={projectRef}
                subject={`Failed to load messages in #${selectedChannel.slug}`}
                error={messagesQuery.error}
                onRetry={() => void messagesQuery.refetch()}
              />
            ) : (
              <MessageList
                channel={selectedChannel}
                messages={messageViews}
                hasOlder={Boolean(messagesQuery.hasNextPage)}
                isLoadingOlder={messagesQuery.isFetchingNextPage}
                onLoadOlder={() => void messagesQuery.fetchNextPage()}
                onOpenThread={openThread}
                activeThreadId={threadRoot?.id ?? null}
                currentMemberId={member?.id}
                canReact={canManage && !!member && !isArchived}
                memberNames={members.map((row) => row.display_name)}
                onToggleReaction={(target, emoji, remove) => {
                  if (!member) return
                  toggleReaction({
                    ...connection,
                    channelId: selectedChannel.id,
                    messageId: target.id,
                    memberId: member.id,
                    emoji,
                    remove,
                  })
                }}
                onEdit={async (target, body) => {
                  try {
                    await editMessage({
                      ...connection,
                      channelId: selectedChannel.id,
                      messageId: target.id,
                      body,
                    })
                    return true
                  } catch {
                    return false
                  }
                }}
                onDelete={(target) => {
                  deleteMessage({
                    ...connection,
                    channelId: selectedChannel.id,
                    messageId: target.id,
                    parentId: target.parent_id,
                  })
                }}
              />
            )}

            {selectedChannel ? (
              <Composer
                placeholder={
                  selectedChannel.kind === 'direct' || selectedChannel.kind === 'group'
                    ? `Message ${channelTitle}`
                    : `Message #${selectedChannel.slug}`
                }
                isReadOnly={readOnly || !member || isArchived}
                isEventStream={selectedChannel.kind === 'activity'}
                isSending={isSending}
                error={sendError}
                members={members}
                typingLabel={presence.typingLabel}
                onTyping={presence.notifyTyping}
                onSend={async (body, files) => {
                  if (!member) return false
                  setSendError(null)
                  try {
                    await sendMessage({
                      ...connection,
                      channelId: selectedChannel.id,
                      authorId: member.id,
                      body,
                      files,
                    })
                    return true
                  } catch {
                    return false
                  }
                }}
              />
            ) : null}
          </div>

          {searchOpen ? (
            <SearchPanel
              projectRef={projectRef}
              channelId={selectedChannel?.id}
              membersById={membersById}
              onJumpToChannel={setSelectedChannelId}
              onClose={() => setSearchOpen(false)}
            />
          ) : null}

          {threadRoot && selectedChannel && !searchOpen ? (
            <div className={cn('flex min-h-0 shrink-0')}>
              <ThreadPanel
                projectRef={projectRef}
                channelId={selectedChannel.id}
                root={threadRoot}
                role={member?.role ?? bootstrap.data?.role}
                memberId={member?.id}
                membersById={membersById}
                members={members}
                onClose={closeThread}
              />
            </div>
          ) : null}
        </div>
      </div>

      <CreateChannelDialog
        open={createOpen}
        isSubmitting={isCreatingChannel}
        onOpenChange={setCreateOpen}
        onSubmit={async ({ name, topic, isPrivate }) => {
          try {
            const id = await createChannel({
              ...connection,
              name,
              topic,
              isPrivate,
            })
            setSelectedChannelId(id)
            return true
          } catch {
            return false
          }
        }}
      />

      <StartDmDialog
        open={dmOpen}
        members={members}
        currentMemberId={member?.id}
        isSubmitting={isOpeningDm || isOpeningGroup}
        onOpenChange={setDmOpen}
        onSubmit={async (memberIds) => {
          try {
            const id =
              memberIds.length === 1
                ? await openDirect({ ...connection, otherMemberId: memberIds[0]! })
                : await openGroup({ ...connection, memberIds })
            setSelectedChannelId(id)
            return true
          } catch {
            return false
          }
        }}
      />
    </div>
  )
}
