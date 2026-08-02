import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { DiscussChannelWithUnread } from 'data/discuss/discuss.types'
import { Button, cn } from 'ui'

import { ActivityCard } from './ActivityCard'
import { DISCUSS_FOCUS_RING } from './Discuss.constants'
import type { DiscussMessageView } from './Discuss.types'
import {
  estimateRowHeight,
  formatDayDivider,
  isActivityMessage,
  isSameDay,
  shouldGroupWithPrevious,
} from './Discuss.utils'
import { EmptyActivityChannel, EmptyStandardChannel } from './DiscussStates'
import { MessageRow } from './MessageRow'

type Row =
  | { kind: 'day'; key: string; iso: string }
  | { kind: 'message'; key: string; message: DiscussMessageView; isGrouped: boolean }

const DAY_ROW_HEIGHT = 40
/** Treat "within this many px of the bottom" as following the conversation. */
const STICK_TO_BOTTOM_PX = 80

interface MessageListProps {
  channel: DiscussChannelWithUnread
  messages: DiscussMessageView[]
  hasOlder: boolean
  isLoadingOlder: boolean
  onLoadOlder: () => void
  onOpenThread: (message: DiscussMessageView) => void
  activeThreadId: string | null
  /** Used to suppress the aria-live announcement for the reader's own messages. */
  currentMemberId: string | undefined
  canReact: boolean
  memberNames?: string[]
  onToggleReaction: (message: DiscussMessageView, emoji: string, remove: boolean) => void
  onEdit: (message: DiscussMessageView, body: string) => Promise<boolean>
  onDelete: (message: DiscussMessageView) => void
}

export const MessageList = ({
  channel,
  messages,
  hasOlder,
  isLoadingOlder,
  onLoadOlder,
  onOpenThread,
  activeThreadId,
  currentMemberId,
  canReact,
  memberNames = [],
  onToggleReaction,
  onEdit,
  onDelete,
}: MessageListProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [announcement, setAnnouncement] = useState('')
  const lastSeenIdRef = useRef<string | null>(null)
  const pendingPrependRef = useRef<number | null>(null)

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    let previous: DiscussMessageView | undefined
    for (const message of messages) {
      if (!previous || !isSameDay(previous.created_at, message.created_at)) {
        out.push({ kind: 'day', key: `day-${message.created_at}`, iso: message.created_at })
        previous = undefined
      }
      out.push({
        kind: 'message',
        key: message.id,
        message,
        isGrouped: shouldGroupWithPrevious(message, previous),
      })
      previous = message
    }
    return out
  }, [messages])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => rows[index]?.key ?? index,
    estimateSize: (index) => {
      const row = rows[index]
      if (!row) return DAY_ROW_HEIGHT
      if (row.kind === 'day') return DAY_ROW_HEIGHT
      return estimateRowHeight(row.message, row.isGrouped)
    },
    overscan: 8,
  })

  const virtualItems = virtualizer.getVirtualItems()

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [])

  /*
   * Follow the conversation only while the reader is already at the bottom. Yanking someone away
   * from the message they are reading because a poll landed is the single most hated behaviour in
   * a chat client.
   */
  useLayoutEffect(() => {
    if (isPinnedToBottom) scrollToBottom()
  }, [messages.length, isPinnedToBottom, scrollToBottom])

  /*
   * Older pages are PREPENDED, which would otherwise shove the viewport down by the height of the
   * new content. Capture scrollHeight before the prepend paints and restore the offset after.
   */
  useLayoutEffect(() => {
    const element = scrollRef.current
    const previousHeight = pendingPrependRef.current
    if (!element || previousHeight === null) return
    pendingPrependRef.current = null
    const delta = element.scrollHeight - previousHeight
    if (delta > 0) element.scrollTop += delta
  }, [messages.length])

  // aria-live: announce messages that arrive from other people while the list is open.
  useEffect(() => {
    const newest = messages[messages.length - 1]
    if (!newest) return

    const previousId = lastSeenIdRef.current
    lastSeenIdRef.current = newest.id
    if (previousId === null || previousId === newest.id) return
    if (newest.author_id !== null && newest.author_id === currentMemberId) return

    if (isActivityMessage(newest)) {
      setAnnouncement(`New activity in ${channel.name}`)
    } else {
      setAnnouncement(
        `${newest.author?.display_name ?? 'Someone'} in ${channel.name}: ${newest.body ?? ''}`
      )
    }
  }, [messages, channel.name, currentMemberId])

  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    setIsPinnedToBottom(distanceFromBottom <= STICK_TO_BOTTOM_PX)

    if (element.scrollTop < 200 && hasOlder && !isLoadingOlder) {
      pendingPrependRef.current = element.scrollHeight
      onLoadOlder()
    }
  }, [hasOlder, isLoadingOlder, onLoadOlder])

  if (messages.length === 0) {
    return channel.kind === 'activity' ? <EmptyActivityChannel /> : <EmptyStandardChannel channelName={channel.slug} />
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/*
       * The announcer is separate from the transcript. Marking the whole virtualised list as a live
       * region would make a screen reader read every row that scrolls into the window.
       */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="log"
        aria-label={`Messages in ${channel.name}`}
        className={cn('flex-1 overflow-y-auto overflow-x-hidden', DISCUSS_FOCUS_RING)}
      >
        {hasOlder ? (
          <div className="flex items-center justify-center py-3">
            {isLoadingOlder ? (
              <span className="inline-flex items-center gap-2 text-xs text-foreground-light">
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                Loading earlier messages…
              </span>
            ) : (
              <Button type="text" size="tiny" className={DISCUSS_FOCUS_RING} onClick={onLoadOlder}>
                Load earlier messages
              </Button>
            )}
          </div>
        ) : null}

        <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.kind === 'day' ? (
                  <div className="flex items-center gap-3 px-4 py-2">
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                    <span className="text-xs font-medium text-foreground-light">
                      {formatDayDivider(row.iso)}
                    </span>
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  </div>
                ) : isActivityMessage(row.message) ? (
                  <div className="px-4 py-1.5">
                    <ActivityCard
                      message={row.message}
                      replyCount={row.message.replyCount}
                      onOpenThread={onOpenThread}
                      className={activeThreadId === row.message.id ? 'ring-1 ring-border-strong' : undefined}
                    />
                  </div>
                ) : (
                  <MessageRow
                    message={row.message}
                    isGrouped={row.isGrouped}
                    isActiveThread={activeThreadId === row.message.id}
                    isOwnMessage={row.message.author_id === currentMemberId}
                    canReact={canReact}
                    memberNames={memberNames}
                    onOpenThread={onOpenThread}
                    onToggleReaction={onToggleReaction}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {!isPinnedToBottom ? (
        <Button
          type="default"
          size="tiny"
          icon={<ArrowDown size={12} />}
          className={cn('absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md', DISCUSS_FOCUS_RING)}
          onClick={() => {
            setIsPinnedToBottom(true)
            scrollToBottom()
          }}
        >
          Jump to latest
        </Button>
      ) : null}
    </div>
  )
}
