import { useMemo, useState } from 'react'

import {
  useCrmCreateActivityMutation,
  useCrmUpdateActivityMutation,
} from 'data/crm/crm-activities-query'
import { useCrmConnection } from 'data/crm/crm-connection'
import type { CrmActivity, CrmActivityKind, CrmRelatedModule } from 'data/crm/crm.types'
import { Button, Input_Shadcn_, cn } from 'ui'

import { CRM_FOCUS_RING } from './Crm.constants'

interface RecordActivitiesProps {
  projectRef?: string
  relatedModule: CrmRelatedModule
  relatedId: string
  activities: CrmActivity[]
  memberId?: string
  canWrite: boolean
}

export const RecordActivities = ({
  projectRef,
  relatedModule,
  relatedId,
  activities,
  memberId,
  canWrite,
}: RecordActivitiesProps) => {
  const { connection } = useCrmConnection({ projectRef })
  const { mutateAsync: createActivity, isPending } = useCrmCreateActivityMutation()
  const { mutate: updateActivity } = useCrmUpdateActivityMutation()
  const [kind, setKind] = useState<CrmActivityKind>('task')
  const [subject, setSubject] = useState('')

  const related = useMemo(
    () =>
      activities.filter(
        (row) => row.related_module === relatedModule && row.related_id === relatedId
      ),
    [activities, relatedModule, relatedId]
  )

  return (
    <div className="space-y-3">
      {canWrite ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void createActivity({
              ...connection,
              kind,
              subject,
              relatedModule,
              relatedId,
              createdBy: memberId,
            }).then(() => setSubject(''))
          }}
        >
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CrmActivityKind)}
            className={cn('h-9 rounded-md border bg-background px-2 text-sm', CRM_FOCUS_RING)}
          >
            <option value="task">Task</option>
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
          </select>
          <Input_Shadcn_
            value={subject}
            placeholder="Activity subject…"
            onChange={(e) => setSubject(e.target.value)}
            className={cn('min-w-[10rem] flex-1', CRM_FOCUS_RING)}
          />
          <Button type="primary" size="tiny" htmlType="submit" loading={isPending} disabled={!subject.trim()}>
            Add
          </Button>
        </form>
      ) : null}

      <ul className="space-y-2">
        {related.length === 0 ? (
          <li className="text-sm text-foreground-lighter">No linked activities</li>
        ) : (
          related.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-surface-100 px-3 py-2"
            >
              <div>
                <p className="text-sm text-foreground">{row.subject}</p>
                <p className="text-[11px] text-foreground-lighter">
                  {row.kind} · {row.status}
                </p>
              </div>
              {canWrite ? (
                <select
                  className={cn('rounded border px-2 py-1 text-xs', CRM_FOCUS_RING)}
                  value={row.status}
                  onChange={(e) =>
                    updateActivity({
                      ...connection,
                      activityId: row.id,
                      status: e.target.value as typeof row.status,
                    })
                  }
                >
                  {['Not Started', 'In Progress', 'Completed', 'Cancelled'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
