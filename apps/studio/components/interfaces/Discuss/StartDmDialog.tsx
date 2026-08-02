import { useMemo, useState } from 'react'

import type { DiscussMember } from 'data/discuss/discuss.types'
import { Button, Input_Shadcn_, Modal, cn } from 'ui'

import { DISCUSS_FOCUS_RING } from './Discuss.constants'
import { initialsFor } from './Discuss.utils'

interface StartDmDialogProps {
  open: boolean
  members: DiscussMember[]
  currentMemberId: string | undefined
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (memberIds: string[]) => Promise<boolean>
}

export const StartDmDialog = ({
  open,
  members,
  currentMemberId,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: StartDmDialogProps) => {
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase()
    return members
      .filter((member) => member.id !== currentMemberId)
      .filter((member) => {
        if (!term) return true
        return (
          member.display_name.toLowerCase().includes(term) ||
          member.email.toLowerCase().includes(term)
        )
      })
      .slice(0, 40)
  }, [members, currentMemberId, query])

  const reset = () => {
    setQuery('')
    setSelectedIds([])
  }

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]
    )
  }

  return (
    <Modal
      visible={open}
      onCancel={() => {
        if (isSubmitting) return
        reset()
        onOpenChange(false)
      }}
      header="Message teammates"
      size="small"
      customFooter={
        <div className="flex justify-end gap-2">
          <Button
            type="default"
            disabled={isSubmitting}
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
          >
            Cancel
          </Button>
          <Button
            type="primary"
            loading={isSubmitting}
            disabled={selectedIds.length === 0}
            onClick={async () => {
              if (selectedIds.length === 0) return
              const ok = await onSubmit(selectedIds)
              if (ok) {
                reset()
                onOpenChange(false)
              }
            }}
          >
            {selectedIds.length > 1 ? 'Open group' : 'Open'}
          </Button>
        </div>
      }
    >
      <Modal.Content className="space-y-3 py-4">
        <p className="text-xs text-foreground-light">
          Pick one teammate for a direct message, or several for a group.
        </p>
        <Input_Shadcn_
          autoFocus
          value={query}
          placeholder="Search teammates"
          onChange={(event) => setQuery(event.target.value)}
          className={cn(DISCUSS_FOCUS_RING)}
        />
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <li className="px-2 py-3 text-sm text-foreground-light">No teammates found.</li>
          ) : (
            candidates.map((member) => {
              const selected = selectedIds.includes(member.id)
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => toggle(member.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left',
                      DISCUSS_FOCUS_RING,
                      selected ? 'bg-surface-300' : 'hover:bg-surface-200'
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border text-[10px]',
                        selected
                          ? 'border-[#3B8FD6] bg-[#3B8FD6] text-white'
                          : 'border-border bg-background'
                      )}
                    >
                      {selected ? '✓' : ''}
                    </span>
                    <span className="flex size-7 items-center justify-center rounded-full bg-surface-200 text-xs">
                      {initialsFor(member.display_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {member.display_name}
                      </span>
                      <span className="block truncate text-xs text-foreground-lighter">
                        {member.email}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </Modal.Content>
    </Modal>
  )
}
