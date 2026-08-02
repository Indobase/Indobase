import { Bell } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { DiscussNotification } from 'data/discuss/discuss.types'
import { Button, Popover_Shadcn_, PopoverContent_Shadcn_, PopoverTrigger_Shadcn_, cn } from 'ui'

import { DISCUSS_FOCUS_RING, DISCUSS_UNREAD_BADGE } from './Discuss.constants'
import { formatRelativeTime } from './Discuss.utils'

interface NotificationsMenuProps {
  notifications: DiscussNotification[]
  onOpenChannel: (channelId: string) => void
  onMarkAllRead: () => void
}

export const NotificationsMenu = ({
  notifications,
  onOpenChannel,
  onMarkAllRead,
}: NotificationsMenuProps) => {
  const [open, setOpen] = useState(false)
  const unread = useMemo(
    () => notifications.filter((row) => row.read_at === null),
    [notifications]
  )

  return (
    <Popover_Shadcn_ open={open} onOpenChange={setOpen}>
      <PopoverTrigger_Shadcn_ asChild>
        <Button
          type="text"
          size="tiny"
          aria-label={
            unread.length > 0
              ? `${unread.length} unread notifications`
              : 'Notifications'
          }
          icon={<Bell size={14} />}
          className={cn('relative', DISCUSS_FOCUS_RING)}
        >
          {unread.length > 0 ? (
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full px-1 py-0.5 text-center text-[10px] font-semibold leading-none',
                DISCUSS_UNREAD_BADGE
              )}
            >
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger_Shadcn_>
      <PopoverContent_Shadcn_ align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-light">
            Notifications
          </p>
          {unread.length > 0 ? (
            <Button type="text" size="tiny" onClick={onMarkAllRead}>
              Mark all read
            </Button>
          ) : null}
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-foreground-light">
              No notifications yet
            </li>
          ) : (
            notifications.map((row) => (
              <li key={row.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-surface-100',
                    DISCUSS_FOCUS_RING,
                    row.read_at === null && 'bg-surface-100/60'
                  )}
                  onClick={() => {
                    if (row.channel_id) onOpenChannel(row.channel_id)
                    setOpen(false)
                  }}
                >
                  <span className="text-sm text-foreground">{row.title}</span>
                  {row.body ? (
                    <span className="line-clamp-2 text-xs text-foreground-light">{row.body}</span>
                  ) : null}
                  <span className="text-[11px] text-foreground-lighter">
                    {formatRelativeTime(row.created_at)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent_Shadcn_>
    </Popover_Shadcn_>
  )
}
