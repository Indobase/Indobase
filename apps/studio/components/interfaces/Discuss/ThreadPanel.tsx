import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { useDiscussSendMessageWithFilesMutation } from 'data/discuss/discuss-attachments'
import { useDiscussConnection } from 'data/discuss/discuss-connection'
import {
  useDiscussDeleteMessageMutation,
  useDiscussEditMessageMutation,
} from 'data/discuss/discuss-message-mutations'
import { useDiscussToggleReactionMutation } from 'data/discuss/discuss-reactions-query'
import { useDiscussThreadQuery } from 'data/discuss/discuss-thread-query'
import type { DiscussMember, DiscussRole } from 'data/discuss/discuss.types'
import { Button, cn } from 'ui'

import { ActivityCard } from './ActivityCard'
import { Composer } from './Composer'
import { DISCUSS_FOCUS_RING } from './Discuss.constants'
import { toMessageViews, type DiscussMessageView } from './Discuss.types'
import { isActivityMessage, isReadOnlyRole } from './Discuss.utils'
import { DiscussErrorState, EmptyThread, MessageListSkeleton } from './DiscussStates'
import { MessageRow } from './MessageRow'

interface ThreadPanelProps {
  projectRef: string
  channelId: string
  root: DiscussMessageView
  role: DiscussRole | undefined
  memberId: string | undefined
  membersById: Map<string, DiscussMember>
  members: DiscussMember[]
  onClose: () => void
}

const noop = () => {}
const NO_REPLY_COUNTS = new Map<string, number>()

export const ThreadPanel = ({
  projectRef,
  channelId,
  root,
  role,
  memberId,
  membersById,
  members,
  onClose,
}: ThreadPanelProps) => {
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const { connection } = useDiscussConnection({ projectRef })

  const { data, error, isPending, isError, refetch } = useDiscussThreadQuery({
    projectRef,
    parentId: root.id,
  })

  const { mutateAsync: sendMessage, isPending: isSending } = useDiscussSendMessageWithFilesMutation({
    onError: (mutationError) => setSendError(mutationError.message),
  })
  const { mutateAsync: editMessage } = useDiscussEditMessageMutation()
  const { mutate: deleteMessage } = useDiscussDeleteMessageMutation()
  const { mutate: toggleReaction } = useDiscussToggleReactionMutation()

  useEffect(() => {
    headingRef.current?.focus()
  }, [root.id])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  const replies = useMemo(
    () => toMessageViews(data ?? [], membersById, NO_REPLY_COUNTS),
    [data, membersById]
  )

  const readOnly = isReadOnlyRole(role)
  const canReact = !readOnly && !!memberId
  const memberNames = useMemo(() => members.map((row) => row.display_name), [members])

  const renderRow = (message: DiscussMessageView) => (
    <MessageRow
      key={message.id}
      message={message}
      isGrouped={false}
      isActiveThread={false}
      isOwnMessage={message.author_id === memberId}
      canReact={canReact}
      memberNames={memberNames}
      onOpenThread={noop}
      onToggleReaction={(target, emoji, remove) => {
        if (!memberId) return
        toggleReaction({
          ...connection,
          channelId,
          messageId: target.id,
          memberId,
          emoji,
          remove,
        })
      }}
      onEdit={async (target, body) => {
        try {
          await editMessage({ ...connection, channelId, messageId: target.id, body })
          return true
        } catch {
          return false
        }
      }}
      onDelete={(target) => {
        deleteMessage({
          ...connection,
          channelId,
          messageId: target.id,
          parentId: target.parent_id,
        })
      }}
    />
  )

  return (
    <aside
      aria-label="Thread"
      onKeyDown={handleKeyDown}
      className="flex h-full min-h-0 w-[360px] shrink-0 flex-col border-l bg-background xl:w-[420px]"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className={cn('text-sm font-medium text-foreground', DISCUSS_FOCUS_RING)}
        >
          Thread
        </h2>
        <Button
          type="text"
          size="tiny"
          aria-label="Close thread"
          icon={<X size={14} />}
          className={DISCUSS_FOCUS_RING}
          onClick={onClose}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b pb-2">
          {isActivityMessage(root) ? (
            <div className="p-3">
              <ActivityCard message={root} replyCount={replies.length} onOpenThread={noop} />
            </div>
          ) : (
            renderRow(root)
          )}
        </div>

        {isPending ? (
          <MessageListSkeleton />
        ) : isError ? (
          <DiscussErrorState
            projectRef={projectRef}
            subject="Failed to load Discuss thread"
            error={error}
            onRetry={() => void refetch()}
          />
        ) : replies.length === 0 ? (
          <EmptyThread />
        ) : (
          <div className="py-2">{replies.map(renderRow)}</div>
        )}
      </div>

      <Composer
        placeholder="Reply in thread"
        isReadOnly={readOnly || !memberId}
        isSending={isSending}
        error={sendError}
        members={members}
        onSend={async (body, files) => {
          if (!memberId) return false
          setSendError(null)
          try {
            await sendMessage({
              ...connection,
              channelId,
              authorId: memberId,
              body,
              files,
              parentId: root.id,
            })
            return true
          } catch {
            return false
          }
        }}
      />

      <span className="sr-only" aria-live="polite">
        {isPending
          ? 'Loading thread'
          : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'} in this thread`}
      </span>
    </aside>
  )
}
