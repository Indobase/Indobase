import { useMemo, useState } from 'react'

import {
  useCrmCreateNoteMutation,
  useCrmNotesQuery,
} from 'data/crm/crm-notes-query'
import { useCrmConnection } from 'data/crm/crm-connection'
import type { CrmRelatedModule } from 'data/crm/crm.types'
import { Button, ExpandingTextArea, cn } from 'ui'

import { CRM_FOCUS_RING } from './Crm.constants'

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface RecordNotesProps {
  projectRef?: string
  relatedModule: CrmRelatedModule
  relatedId: string
  memberId?: string
  canWrite: boolean
}

export const RecordNotes = ({
  projectRef,
  relatedModule,
  relatedId,
  memberId,
  canWrite,
}: RecordNotesProps) => {
  const { connection } = useCrmConnection({ projectRef })
  const notesQuery = useCrmNotesQuery({ projectRef, relatedModule, relatedId })
  const { mutateAsync: createNote, isPending } = useCrmCreateNoteMutation()
  const [body, setBody] = useState('')

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data])

  return (
    <div className="space-y-3">
      {canWrite ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            void createNote({
              ...connection,
              body,
              relatedModule,
              relatedId,
              createdBy: memberId,
            }).then(() => setBody(''))
          }}
        >
          <ExpandingTextArea
            value={body}
            placeholder="Add a note…"
            onChange={(e) => setBody(e.target.value)}
            className={cn('max-h-32 text-sm', CRM_FOCUS_RING)}
          />
          <Button type="primary" size="tiny" htmlType="submit" loading={isPending} disabled={!body.trim()}>
            Save note
          </Button>
        </form>
      ) : null}

      <ul className="space-y-2">
        {notes.length === 0 ? (
          <li className="text-sm text-foreground-lighter">No notes yet</li>
        ) : (
          notes.map((note) => (
            <li key={note.id} className="rounded-md border bg-surface-100 px-3 py-2">
              <p className="whitespace-pre-wrap text-sm text-foreground-light">{note.body}</p>
              <p className="mt-1 text-[11px] text-foreground-lighter">
                {formatWhen(note.created_at)}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
