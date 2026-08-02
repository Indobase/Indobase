import { Hash, MessagesSquare, Radio } from 'lucide-react'

import AlertError from 'components/ui/AlertError'
import { Button, cn } from 'ui'
import { EmptyStatePresentational } from 'ui-patterns/EmptyStatePresentational'
import { ShimmeringLoader } from 'ui-patterns/ShimmeringLoader'

import { DISCUSS_FOCUS_RING } from './Discuss.constants'

/**
 * Loading, empty and error states are first-class here rather than an afterthought.
 *
 * The forks failed exactly this way: a loading overlay that never dismissed, and a channel-join
 * that failed silently so the product showed "Join a team" with no error anywhere. Every state
 * below either says what is happening or says what went wrong — never nothing.
 */

export const ChannelSidebarSkeleton = () => (
  <div className="space-y-1 p-2" aria-hidden="true">
    {[0, 1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-2 px-2 py-1.5">
        <ShimmeringLoader className="h-3.5 w-3.5 rounded" delayIndex={i} />
        <ShimmeringLoader
          className={cn('h-3.5', i % 2 === 0 ? 'w-28' : 'w-20')}
          delayIndex={i}
        />
      </div>
    ))}
  </div>
)

export const MessageListSkeleton = () => (
  <div className="space-y-5 p-4" aria-hidden="true">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex gap-3">
        <ShimmeringLoader className="size-8 shrink-0 rounded-full" delayIndex={i} />
        <div className="flex-1 space-y-2">
          <ShimmeringLoader className="h-3 w-32" delayIndex={i} />
          <ShimmeringLoader className={cn('h-3', i % 3 === 0 ? 'w-full' : 'w-3/5')} delayIndex={i} />
        </div>
      </div>
    ))}
  </div>
)

export const DiscussLoadingState = ({ label }: { label: string }) => (
  <div
    role="status"
    aria-live="polite"
    className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
  >
    <p className="text-sm text-foreground">{label}</p>
    <p className="text-xs text-foreground-light">Using your Studio session — no separate sign-in.</p>
  </div>
)

interface DiscussErrorStateProps {
  projectRef?: string
  subject: string
  error: { message: string } | null | undefined
  onRetry?: () => void
  className?: string
}

export const DiscussErrorState = ({
  projectRef,
  subject,
  error,
  onRetry,
  className,
}: DiscussErrorStateProps) => (
  <div className={cn('p-4', className)} role="alert">
    <AlertError
      projectRef={projectRef}
      subject={subject}
      error={error ?? { message: 'An unknown error occurred' }}
      additionalActions={
        onRetry ? (
          <Button type="default" onClick={onRetry} className={cn('w-min', DISCUSS_FOCUS_RING)}>
            Try again
          </Button>
        ) : undefined
      }
    />
  </div>
)

export const EmptyStandardChannel = ({ channelName }: { channelName: string }) => (
  <EmptyStatePresentational
    icon={Hash}
    title={`This is the start of #${channelName}`}
    description="Nothing has been said here yet. Post the first message to get the thread going."
    className="h-full border-0"
  />
)

export const EmptyActivityChannel = () => (
  <EmptyStatePresentational
    icon={Radio}
    title="No activity yet"
    description="Deploys, payments and builds land here as cards the moment they happen. Nothing has been published for this project so far."
    className="h-full border-0"
  />
)

export const EmptyThread = () => (
  <EmptyStatePresentational
    icon={MessagesSquare}
    title="No replies yet"
    description="Replies stay in this thread instead of filling the channel."
    className="border-0"
  />
)

/**
 * The specific failure that killed the Mattermost integration: provisioning "succeeded" but the
 * member ended up in zero channels, and the product rendered a generic prompt with no error. If
 * bootstrap returns nothing, say so loudly instead of showing an empty room.
 */
export const NoChannelsState = ({ onRetry }: { onRetry: () => void }) => (
  <div role="alert" className="flex h-full items-center justify-center p-8">
    <EmptyStatePresentational
      icon={Hash}
      title="Discuss finished setting up but you are not in any channel"
      description="This should not happen — General, Announcements and Activity are created and joined on first open. Retrying re-runs setup, which is safe to repeat."
    >
      <Button type="default" onClick={onRetry} className={DISCUSS_FOCUS_RING}>
        Retry setup
      </Button>
    </EmptyStatePresentational>
  </div>
)
