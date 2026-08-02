import { ExternalLink, MessageSquare } from 'lucide-react'
import { memo } from 'react'

import { Button, cn } from 'ui'

import { ACTIVITY_ACCENTS, DISCUSS_FOCUS_RING } from './Discuss.constants'
import type { DiscussMessageView } from './Discuss.types'
import { describeActivityEvent, formatAbsoluteTimestamp, formatRelativeTime } from './Discuss.utils'

interface ActivityCardProps {
  message: DiscussMessageView
  replyCount: number
  onOpenThread: (message: DiscussMessageView) => void
  className?: string
}

/**
 * Platform events render as CARDS, never as chat lines.
 *
 * This is the whole argument for building Discuss instead of forking a chat product: a deploy, a
 * payment and a build are first-class objects a team acts on, not grey italic text that scrolls
 * past. The card carries its own accent, its own icon, its own facts and its own actions.
 */
export const ActivityCard = memo(
  ({ message, replyCount, onOpenThread, className }: ActivityCardProps) => {
    const descriptor = describeActivityEvent(message.event_type ?? '', message.event_data)
    const accent = ACTIVITY_ACCENTS[descriptor.accent]
    const Icon = descriptor.kind.icon

    return (
      <article
        // `article` rather than a bare div: an event card is a self-contained unit, and screen
        // reader users can jump between them.
        aria-label={`${descriptor.eyebrow} event: ${descriptor.title}`}
        className={cn(
          'rounded-lg border border-l-2 bg-surface-100 px-4 py-3',
          accent.edge,
          className
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md', accent.wash)}
          >
            <Icon size={16} strokeWidth={2} className={accent.text} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={cn('text-xs font-medium uppercase tracking-wide', accent.text)}>
                {descriptor.eyebrow}
              </span>
              {descriptor.outcome ? (
                <span className="text-xs text-foreground-light">{descriptor.outcome}</span>
              ) : null}
              <time
                dateTime={message.created_at}
                title={formatAbsoluteTimestamp(message.created_at)}
                className="ml-auto text-xs text-foreground-lighter"
              >
                {formatRelativeTime(message.created_at)}
              </time>
            </div>

            <p className="mt-1 break-words text-sm font-medium text-foreground">
              {descriptor.title}
            </p>

            {descriptor.fields.length > 0 ? (
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                {descriptor.fields.map((field) => (
                  <div key={field.label} className="flex min-w-0 items-baseline gap-2 text-xs">
                    <dt className="shrink-0 text-foreground-lighter">{field.label}</dt>
                    <dd className="min-w-0 truncate font-mono text-foreground-light">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {descriptor.link ? (
                <Button
                  asChild
                  type="default"
                  size="tiny"
                  icon={<ExternalLink size={12} />}
                  className={DISCUSS_FOCUS_RING}
                >
                  <a href={descriptor.link} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                </Button>
              ) : null}
              <Button
                type="text"
                size="tiny"
                icon={<MessageSquare size={12} />}
                className={DISCUSS_FOCUS_RING}
                onClick={() => onOpenThread(message)}
              >
                {replyCount > 0
                  ? `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`
                  : 'Discuss this'}
              </Button>
            </div>
          </div>
        </div>
      </article>
    )
  }
)

ActivityCard.displayName = 'ActivityCard'
