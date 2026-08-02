import { MessageSquare, Pencil, Trash2 } from 'lucide-react'
import { memo, useState } from 'react'

import { Button, ExpandingTextArea, cn } from 'ui'

import { AttachmentChip } from './AttachmentViews'
import { DISCUSS_BLUE_TEXT, DISCUSS_FOCUS_RING } from './Discuss.constants'
import type { DiscussMessageView } from './Discuss.types'
import {
  QUICK_REACTIONS,
  formatAbsoluteTimestamp,
  formatClockTime,
  initialsFor,
  splitMentions,
} from './Discuss.utils'

interface MessageRowProps {
  message: DiscussMessageView
  isGrouped: boolean
  isActiveThread: boolean
  isOwnMessage: boolean
  canReact: boolean
  memberNames?: string[]
  onOpenThread: (message: DiscussMessageView) => void
  onToggleReaction: (message: DiscussMessageView, emoji: string, remove: boolean) => void
  onEdit: (message: DiscussMessageView, body: string) => Promise<boolean>
  onDelete: (message: DiscussMessageView) => void
}

export const MessageRow = memo(
  ({
    message,
    isGrouped,
    isActiveThread,
    isOwnMessage,
    canReact,
    memberNames = [],
    onOpenThread,
    onToggleReaction,
    onEdit,
    onDelete,
  }: MessageRowProps) => {
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState(message.body ?? '')
    const [isSaving, setIsSaving] = useState(false)

    const authorName = message.author?.display_name ?? 'Removed member'
    const avatarUrl = message.author?.avatar_url ?? null

    const saveEdit = async () => {
      setIsSaving(true)
      try {
        const ok = await onEdit(message, draft)
        if (ok) setIsEditing(false)
      } finally {
        setIsSaving(false)
      }
    }

    return (
      <div
        className={cn(
          'group relative flex gap-3 px-4 py-1 transition-colors hover:bg-surface-100',
          isGrouped ? 'pt-0.5' : 'pt-3',
          isActiveThread && 'bg-surface-200'
        )}
      >
        <div className="w-8 shrink-0">
          {isGrouped ? (
            <span
              aria-hidden="true"
              className="mt-1 block text-[10px] leading-5 text-transparent group-hover:text-foreground-lighter"
            >
              {formatClockTime(message.created_at)}
            </span>
          ) : avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-surface-300 text-xs font-medium text-foreground-light"
            >
              {initialsFor(authorName)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!isGrouped && (
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground">{authorName}</span>
              <time
                dateTime={message.created_at}
                title={formatAbsoluteTimestamp(message.created_at)}
                className="text-xs text-foreground-lighter"
              >
                {formatClockTime(message.created_at)}
              </time>
              {message.edited_at ? (
                <span className="text-xs text-foreground-lighter">(edited)</span>
              ) : null}
            </div>
          )}

          {isEditing ? (
            <div className="mt-1 space-y-2">
              <ExpandingTextArea
                value={draft}
                disabled={isSaving}
                onChange={(event) => setDraft(event.target.value)}
                className={cn('max-h-40 text-sm', DISCUSS_FOCUS_RING)}
              />
              <div className="flex gap-2">
                <Button type="primary" size="tiny" loading={isSaving} onClick={() => void saveEdit()}>
                  Save
                </Button>
                <Button
                  type="default"
                  size="tiny"
                  disabled={isSaving}
                  onClick={() => {
                    setDraft(message.body ?? '')
                    setIsEditing(false)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {(message.body ?? '').trim().length > 0 &&
              !(message.attachments.length > 0 && message.body === message.attachments[0]?.file_name) ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-[22px] text-foreground-light">
                  {splitMentions(message.body ?? '', memberNames).map((part, index) =>
                    part.type === 'mention' ? (
                      <span
                        key={`${part.value}-${index}`}
                        className={cn('font-medium', DISCUSS_BLUE_TEXT)}
                      >
                        {part.value}
                      </span>
                    ) : (
                      <span key={`${index}-${part.value.slice(0, 8)}`}>{part.value}</span>
                    )
                  )}
                </p>
              ) : null}
              {message.attachments.map((attachment) => (
                <AttachmentChip
                  key={attachment.id}
                  attachment={attachment}
                  projectRef={message.project_ref}
                />
              ))}
            </>
          )}

          {message.reactions.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {message.reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  type="button"
                  disabled={!canReact}
                  onClick={() => onToggleReaction(message, reaction.emoji, reaction.reactedByMe)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
                    DISCUSS_FOCUS_RING,
                    reaction.reactedByMe
                      ? 'border-[#3B8FD6]/50 bg-[#3B8FD6]/10'
                      : 'border-border bg-surface-100 hover:bg-surface-200'
                  )}
                >
                  <span aria-hidden="true">{reaction.emoji}</span>
                  <span>{reaction.count}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-1">
            {message.replyCount > 0 ? (
              <Button
                type="text"
                size="tiny"
                icon={<MessageSquare size={12} />}
                className={cn('-ml-2', DISCUSS_FOCUS_RING)}
                onClick={() => onOpenThread(message)}
              >
                {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
              </Button>
            ) : (
              <Button
                type="text"
                size="tiny"
                icon={<MessageSquare size={12} />}
                className={cn(
                  '-ml-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                  DISCUSS_FOCUS_RING
                )}
                onClick={() => onOpenThread(message)}
              >
                Reply in thread
              </Button>
            )}

            {canReact
              ? QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`React with ${emoji}`}
                    className={cn(
                      'rounded px-1 text-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                      DISCUSS_FOCUS_RING
                    )}
                    onClick={() => {
                      const existing = message.reactions.find((row) => row.emoji === emoji)
                      onToggleReaction(message, emoji, Boolean(existing?.reactedByMe))
                    }}
                  >
                    {emoji}
                  </button>
                ))
              : null}

            {isOwnMessage && !isEditing ? (
              <>
                <Button
                  type="text"
                  size="tiny"
                  icon={<Pencil size={12} />}
                  className={cn(
                    'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                    DISCUSS_FOCUS_RING
                  )}
                  onClick={() => {
                    setDraft(message.body ?? '')
                    setIsEditing(true)
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="text"
                  size="tiny"
                  icon={<Trash2 size={12} />}
                  className={cn(
                    'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                    DISCUSS_FOCUS_RING
                  )}
                  onClick={() => onDelete(message)}
                >
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    )
  }
)

MessageRow.displayName = 'MessageRow'
