import { Archive, Hash, Lock, MessageSquare, Plus, Radio, UserRound, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from 'react'

import type { DiscussChannelWithUnread, DiscussMember } from 'data/discuss/discuss.types'
import { Button, cn } from 'ui'

import { DISCUSS_FOCUS_RING, DISCUSS_UNREAD_BADGE } from './Discuss.constants'
import { directChannelLabel, sortChannels } from './Discuss.utils'

interface ChannelSidebarProps {
  channels: DiscussChannelWithUnread[]
  archivedChannels?: DiscussChannelWithUnread[]
  members: DiscussMember[]
  currentMemberId: string | undefined
  selectedChannelId: string | null
  canManage: boolean
  showArchived?: boolean
  onToggleArchived?: () => void
  onSelect: (channelId: string) => void
  onCreateChannel: () => void
  onStartDm: () => void
}

const ICON_FOR_KIND = {
  standard: Hash,
  activity: Radio,
  direct: UserRound,
  group: Users,
} as const

export const ChannelSidebar = ({
  channels,
  archivedChannels = [],
  members,
  currentMemberId,
  selectedChannelId,
  canManage,
  showArchived = false,
  onToggleArchived,
  onSelect,
  onCreateChannel,
  onStartDm,
}: ChannelSidebarProps) => {
  const ordered = sortChannels(channels)
  const archivedOrdered = sortChannels(archivedChannels)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())

  const sections = useMemo(() => {
    const standard = ordered.filter((channel) => channel.kind === 'standard')
    const directs = ordered.filter(
      (channel) => channel.kind === 'direct' || channel.kind === 'group'
    )
    const activity = ordered.filter((channel) => channel.kind === 'activity')
    const list = [
      { id: 'channels', title: 'Channels', items: standard },
      { id: 'direct', title: 'Direct messages', items: directs },
      { id: 'activity', title: 'Activity', items: activity },
    ].filter((section) => section.items.length > 0 || section.id !== 'activity')

    if (showArchived && archivedOrdered.length > 0) {
      list.push({ id: 'archived', title: 'Archived', items: archivedOrdered })
    }
    return list
  }, [ordered, archivedOrdered, showArchived])

  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections])

  const registerItem = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) itemRefs.current.set(id, element)
    else itemRefs.current.delete(id)
  }, [])

  useEffect(() => {
    const ids = new Set(flat.map((channel) => channel.id))
    for (const key of Array.from(itemRefs.current.keys())) {
      if (!ids.has(key)) itemRefs.current.delete(key)
    }
  }, [flat])

  const focusAt = (index: number) => {
    const target = flat[Math.max(0, Math.min(index, flat.length - 1))]
    if (!target) return
    itemRefs.current.get(target.id)?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusAt(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusAt(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusAt(0)
        break
      case 'End':
        event.preventDefault()
        focusAt(flat.length - 1)
        break
      default:
        break
    }
  }

  const activeIndex = Math.max(
    0,
    flat.findIndex((channel) => channel.id === selectedChannelId)
  )

  let runningIndex = -1

  return (
    <nav aria-label="Discuss channels" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-light">
          Discuss
        </h2>
        {canManage ? (
          <div className="flex items-center gap-0.5">
            <Button
              type="text"
              size="tiny"
              aria-label="Start a direct message"
              icon={<MessageSquare size={12} />}
              className={DISCUSS_FOCUS_RING}
              onClick={onStartDm}
            />
            <Button
              type="text"
              size="tiny"
              aria-label="Create a channel"
              icon={<Plus size={12} />}
              className={DISCUSS_FOCUS_RING}
              onClick={onCreateChannel}
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
        {sections.map((section) => (
          <div key={section.id}>
            <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-foreground-lighter">
              {section.title}
            </div>
            {section.items.length === 0 ? (
              <p className="px-2 py-1 text-xs text-foreground-lighter">
                {section.id === 'direct' ? 'No direct messages yet' : 'No channels yet'}
              </p>
            ) : (
              <ul role="listbox" aria-label={section.title} className="space-y-0.5">
                {section.items.map((channel) => {
                  runningIndex += 1
                  const index = runningIndex
                  const isSelected = channel.id === selectedChannelId
                  const Icon =
                    channel.is_private && channel.kind === 'standard'
                      ? Lock
                      : ICON_FOR_KIND[channel.kind]
                  const unread = channel.unread ?? 0
                  const hasUnread = unread > 0 && !isSelected
                  const label = directChannelLabel(channel, members, currentMemberId)

                  return (
                    <li key={channel.id}>
                      <button
                        ref={(element) => registerItem(channel.id, element)}
                        role="option"
                        type="button"
                        aria-selected={isSelected}
                        tabIndex={index === activeIndex ? 0 : -1}
                        onKeyDown={(event) => handleKeyDown(event, index)}
                        onClick={() => onSelect(channel.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                          DISCUSS_FOCUS_RING,
                          isSelected
                            ? 'bg-surface-300 text-foreground'
                            : 'text-foreground-light hover:bg-surface-200 hover:text-foreground',
                          hasUnread && 'font-medium text-foreground'
                        )}
                      >
                        <Icon size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {hasUnread ? (
                          <span
                            className={cn(
                              'ml-auto min-w-[1.25rem] shrink-0 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none',
                              DISCUSS_UNREAD_BADGE
                            )}
                          >
                            <span aria-hidden="true">{unread > 99 ? '99+' : unread}</span>
                            <span className="sr-only">
                              {unread} unread {unread === 1 ? 'message' : 'messages'}
                            </span>
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      {onToggleArchived ? (
        <div className="border-t px-2 py-2">
          <Button
            type="text"
            size="tiny"
            className={cn('w-full justify-start', DISCUSS_FOCUS_RING)}
            icon={<Archive size={12} />}
            onClick={onToggleArchived}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
        </div>
      ) : null}
    </nav>
  )
}
