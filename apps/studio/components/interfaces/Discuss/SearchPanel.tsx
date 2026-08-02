import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useDiscussSearchQuery } from 'data/discuss/discuss-search-query'
import type { DiscussMember } from 'data/discuss/discuss.types'
import { Button, Input_Shadcn_, cn } from 'ui'

import { DISCUSS_FOCUS_RING } from './Discuss.constants'
import { formatAbsoluteTimestamp, formatRelativeTime } from './Discuss.utils'

interface SearchPanelProps {
  projectRef: string
  channelId: string | undefined
  membersById: Map<string, DiscussMember>
  onJumpToChannel: (channelId: string) => void
  onClose: () => void
}

export const SearchPanel = ({
  projectRef,
  channelId,
  membersById,
  onJumpToChannel,
  onClose,
}: SearchPanelProps) => {
  const [query, setQuery] = useState('')
  const [scopeChannel, setScopeChannel] = useState(false)

  const { data = [], isFetching, isError, error } = useDiscussSearchQuery({
    projectRef,
    query,
    channelId: scopeChannel ? channelId : undefined,
  })

  const results = useMemo(() => data.slice(0, 40), [data])

  return (
    <div className="flex h-full min-h-0 w-[360px] shrink-0 flex-col border-l bg-background xl:w-[420px]">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium text-foreground">Search messages</h2>
        <Button
          type="text"
          size="tiny"
          aria-label="Close search"
          icon={<X size={14} />}
          className={DISCUSS_FOCUS_RING}
          onClick={onClose}
        />
      </header>

      <div className="space-y-2 border-b px-4 py-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-lighter"
          />
          <Input_Shadcn_
            value={query}
            autoFocus
            placeholder="Search in Discuss"
            onChange={(event) => setQuery(event.target.value)}
            className={cn('pl-8', DISCUSS_FOCUS_RING)}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-foreground-light">
          <input
            type="checkbox"
            checked={scopeChannel}
            disabled={!channelId}
            onChange={(event) => setScopeChannel(event.target.checked)}
          />
          Only this channel
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.trim().length === 0 ? (
          <p className="p-4 text-sm text-foreground-light">
            Search message bodies across channels you can read.
          </p>
        ) : isFetching ? (
          <p className="p-4 text-sm text-foreground-light">Searching…</p>
        ) : isError ? (
          <p className="p-4 text-sm text-destructive-600">{error.message}</p>
        ) : results.length === 0 ? (
          <p className="p-4 text-sm text-foreground-light">No matches for “{query.trim()}”.</p>
        ) : (
          <ul className="divide-y">
            {results.map((message) => {
              const author = message.author_id
                ? membersById.get(message.author_id)?.display_name
                : 'Activity'
              return (
                <li key={message.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full px-4 py-3 text-left hover:bg-surface-100',
                      DISCUSS_FOCUS_RING
                    )}
                    onClick={() => {
                      onJumpToChannel(message.channel_id)
                      onClose()
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {author ?? 'Someone'}
                      </span>
                      <time
                        className="shrink-0 text-[11px] text-foreground-lighter"
                        dateTime={message.created_at}
                        title={formatAbsoluteTimestamp(message.created_at)}
                      >
                        {formatRelativeTime(message.created_at)}
                      </time>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs text-foreground-light">{message.body}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
