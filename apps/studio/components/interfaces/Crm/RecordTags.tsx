import { useMemo, useState } from 'react'

import { useCrmConnection } from 'data/crm/crm-connection'
import {
  useCrmCreateTagMutation,
  useCrmRecordTagsQuery,
  useCrmTagsQuery,
  useCrmToggleRecordTagMutation,
} from 'data/crm/crm-tags-query'
import type { CrmRelatedModule } from 'data/crm/crm.types'
import { Button, Input_Shadcn_, cn } from 'ui'

import { CRM_FOCUS_RING } from './Crm.constants'

interface RecordTagsProps {
  projectRef?: string
  relatedModule: CrmRelatedModule
  relatedId: string
  canWrite: boolean
}

export const RecordTags = ({
  projectRef,
  relatedModule,
  relatedId,
  canWrite,
}: RecordTagsProps) => {
  const { connection } = useCrmConnection({ projectRef })
  const tagsQuery = useCrmTagsQuery({ projectRef })
  const recordTagsQuery = useCrmRecordTagsQuery({ projectRef, relatedModule, relatedId })
  const { mutateAsync: createTag, isPending: creating } = useCrmCreateTagMutation()
  const { mutate: toggleTag, isPending: toggling } = useCrmToggleRecordTagMutation()
  const [newName, setNewName] = useState('')

  const tags = tagsQuery.data ?? []
  const assignedIds = useMemo(
    () => new Set((recordTagsQuery.data ?? []).map((row) => row.tag_id)),
    [recordTagsQuery.data]
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 ? (
          <p className="text-sm text-foreground-lighter">No tags yet</p>
        ) : (
          tags.map((tag) => {
            const assigned = assignedIds.has(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                disabled={!canWrite || toggling}
                onClick={() =>
                  toggleTag({
                    ...connection,
                    tagId: tag.id,
                    relatedModule,
                    relatedId,
                    assigned,
                  })
                }
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs transition-colors',
                  CRM_FOCUS_RING,
                  assigned
                    ? 'border-transparent text-white'
                    : 'bg-surface-100 text-foreground-light hover:bg-surface-200',
                  !canWrite && 'cursor-default opacity-80'
                )}
                style={assigned ? { backgroundColor: tag.color } : undefined}
              >
                {tag.name}
              </button>
            )
          })
        )}
      </div>
      {canWrite ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const name = newName.trim()
            if (!name) return
            void createTag({ ...connection, name }).then(async (tag) => {
              setNewName('')
              toggleTag({
                ...connection,
                tagId: tag.id,
                relatedModule,
                relatedId,
                assigned: false,
              })
            })
          }}
        >
          <Input_Shadcn_
            value={newName}
            placeholder="New tag…"
            onChange={(e) => setNewName(e.target.value)}
            className={cn('h-8 flex-1 text-sm', CRM_FOCUS_RING)}
          />
          <Button
            type="default"
            size="tiny"
            htmlType="submit"
            loading={creating}
            disabled={!newName.trim()}
          >
            Add tag
          </Button>
        </form>
      ) : null}
    </div>
  )
}
