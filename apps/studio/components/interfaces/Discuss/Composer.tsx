import { Eye, Loader2, Paperclip, Radio, SendHorizonal } from 'lucide-react'
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'

import type { DiscussMember } from 'data/discuss/discuss.types'
import { DISCUSS_MAX_UPLOAD_BYTES, DISCUSS_MAX_UPLOAD_FILES } from 'data/discuss/discuss-upload'
import { Button, ExpandingTextArea, cn } from 'ui'

import { PendingFiles } from './AttachmentViews'
import { DISCUSS_FOCUS_RING } from './Discuss.constants'
import { initialsFor } from './Discuss.utils'

export interface ComposerHandle {
  focus: () => void
}

interface ComposerProps {
  placeholder: string
  /** `viewer` is read-only — `messages_write` rejects the insert, so do not offer the affordance. */
  isReadOnly: boolean
  /** Activity channels are an event stream; conversation happens in a card's thread. */
  isEventStream?: boolean
  isSending: boolean
  error?: string | null
  members?: DiscussMember[]
  typingLabel?: string | null
  onTyping?: () => void
  onSend: (body: string, files: File[]) => Promise<boolean>
  className?: string
  autoFocus?: boolean
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(
  (
    {
      placeholder,
      isReadOnly,
      isEventStream = false,
      isSending,
      error,
      members = [],
      typingLabel,
      onTyping,
      onSend,
      className,
      autoFocus = false,
    },
    ref
  ) => {
    const [value, setValue] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionIndex, setMentionIndex] = useState(0)
    const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    useImperativeHandle(ref, () => ({
      focus: () => textAreaRef.current?.focus(),
    }))

    const mentionMatches = useMemo(() => {
      if (mentionQuery === null) return []
      const term = mentionQuery.toLowerCase()
      return members
        .filter((member) => {
          if (!term) return true
          return (
            member.display_name.toLowerCase().includes(term) ||
            member.email.toLowerCase().includes(term)
          )
        })
        .slice(0, 6)
    }, [members, mentionQuery])

    const updateMentionState = (nextValue: string, cursor: number | null) => {
      if (cursor === null || cursor === undefined) {
        setMentionQuery(null)
        return
      }
      const before = nextValue.slice(0, cursor)
      const match = before.match(/@([A-Za-z0-9._-]*)$/)
      if (!match) {
        setMentionQuery(null)
        return
      }
      setMentionQuery(match[1] ?? '')
      setMentionIndex(0)
    }

    const insertMention = (member: DiscussMember) => {
      const element = textAreaRef.current
      const cursor = element?.selectionStart ?? value.length
      const before = value.slice(0, cursor)
      const after = value.slice(cursor)
      const replaced = before.replace(/@([A-Za-z0-9._-]*)$/, `@${member.display_name} `)
      const next = `${replaced}${after}`
      setValue(next)
      setMentionQuery(null)
      requestAnimationFrame(() => {
        const pos = replaced.length
        element?.setSelectionRange(pos, pos)
        element?.focus()
      })
    }

    if (isEventStream) {
      return (
        <div
          className={cn(
            'flex items-center gap-2 border-t bg-surface-100 px-4 py-3 text-xs text-foreground-light',
            className
          )}
        >
          <Radio size={14} aria-hidden="true" className="shrink-0" />
          <span>
            Activity is published by the platform. Reply to a specific event to discuss it.
          </span>
        </div>
      )
    }

    if (isReadOnly) {
      return (
        <div
          className={cn(
            'flex items-center gap-2 border-t bg-surface-100 px-4 py-3 text-xs text-foreground-light',
            className
          )}
        >
          <Eye size={14} aria-hidden="true" className="shrink-0" />
          <span>
            You have viewer access to this project, so you can read Discuss but not post. Ask an
            owner or admin to change your role.
          </span>
        </div>
      )
    }

    const canSubmit = (value.trim().length > 0 || files.length > 0) && !isSending

    const submit = async () => {
      if (!canSubmit) return
      const sent = await onSend(value, files)
      if (sent) {
        setValue('')
        setFiles([])
        setMentionQuery(null)
      }
    }

    const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (picked.length === 0) return
      setFiles((prev) => {
        const next = [...prev]
        for (const file of picked) {
          if (next.length >= DISCUSS_MAX_UPLOAD_FILES) break
          if (file.size > DISCUSS_MAX_UPLOAD_BYTES) continue
          next.push(file)
        }
        return next
      })
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionQuery !== null && mentionMatches.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setMentionIndex((index) => (index + 1) % mentionMatches.length)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setMentionIndex((index) => (index - 1 + mentionMatches.length) % mentionMatches.length)
          return
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault()
          const pick = mentionMatches[mentionIndex]
          if (pick) insertMention(pick)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setMentionQuery(null)
          return
        }
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        void submit()
      }
    }

    return (
      <div className={cn('relative border-t bg-surface-100 px-4 py-3', className)}>
        {mentionQuery !== null && mentionMatches.length > 0 ? (
          <ul
            role="listbox"
            className="absolute bottom-full left-4 right-16 z-10 mb-1 overflow-hidden rounded-md border bg-background shadow-md"
          >
            {mentionMatches.map((member, index) => (
              <li key={member.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === mentionIndex}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                    DISCUSS_FOCUS_RING,
                    index === mentionIndex ? 'bg-surface-200' : 'hover:bg-surface-100'
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    insertMention(member)
                  }}
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-surface-300 text-[11px]">
                    {initialsFor(member.display_name)}
                  </span>
                  <span className="truncate">{member.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <PendingFiles files={files} onRemove={(index) => setFiles((prev) => prev.filter((_, i) => i !== index))} />

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx"
            onChange={handleFiles}
          />
          <Button
            type="text"
            size="tiny"
            aria-label="Attach files"
            className={cn('mb-0.5 shrink-0', DISCUSS_FOCUS_RING)}
            disabled={isSending || files.length >= DISCUSS_MAX_UPLOAD_FILES}
            icon={<Paperclip size={14} />}
            onClick={() => fileInputRef.current?.click()}
          />
          <label className="sr-only" htmlFor="discuss-composer">
            {placeholder}
          </label>
          <ExpandingTextArea
            id="discuss-composer"
            ref={textAreaRef}
            autoFocus={autoFocus}
            value={value}
            disabled={isSending}
            placeholder={placeholder}
            onChange={(event) => {
              const next = event.target.value
              setValue(next)
              updateMentionState(next, event.target.selectionStart)
              onTyping?.()
            }}
            onKeyDown={handleKeyDown}
            className={cn('max-h-40 text-sm', DISCUSS_FOCUS_RING)}
          />
          <Button
            type="primary"
            size="tiny"
            className={cn('mb-0.5 shrink-0', DISCUSS_FOCUS_RING)}
            disabled={!canSubmit}
            icon={
              isSending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <SendHorizonal size={14} />
              )
            }
            onClick={() => void submit()}
          >
            {isSending ? 'Sending' : 'Send'}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="mt-2 text-xs text-destructive-600">
            {error}
          </p>
        ) : typingLabel ? (
          <p className="mt-2 text-xs text-foreground-light" aria-live="polite">
            {typingLabel}
          </p>
        ) : (
          <p className="mt-2 text-xs text-foreground-lighter">
            Enter to send · Shift+Enter for a new line · @ to mention · attach up to{' '}
            {DISCUSS_MAX_UPLOAD_FILES} files
          </p>
        )}
      </div>
    )
  }
)

Composer.displayName = 'Composer'
