import { useMemo, useState } from 'react'

import {
  useCrmAutomationsQuery,
  useCrmCreateAutomationMutation,
  useCrmPipelineReportQuery,
  useCrmToggleAutomationMutation,
} from 'data/crm/crm-automations-query'
import { useCrmConnection } from 'data/crm/crm-connection'
import { CRM_LEAD_STATUSES, type CrmActivityKind, type CrmStage } from 'data/crm/crm.types'
import { Button, Input_Shadcn_, cn } from 'ui'

import { CRM_FOCUS_RING } from './Crm.constants'

function money(amount: number | null | undefined, currency = 'INR') {
  if (amount === null || amount === undefined) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount))
  } catch {
    return String(amount)
  }
}

export function CrmReportsPanel({ projectRef }: { projectRef?: string }) {
  const reportQuery = useCrmPipelineReportQuery({ projectRef })
  const rows = reportQuery.data ?? []
  const totalDeals = rows.reduce((sum, row) => sum + row.deal_count, 0)
  const totalAmount = rows.reduce((sum, row) => sum + row.total_amount, 0)
  const won = rows.filter((r) => r.is_won).reduce((sum, r) => sum + r.total_amount, 0)
  const openAmount = rows
    .filter((r) => !r.is_won && !r.is_lost)
    .reduce((sum, r) => sum + r.total_amount, 0)

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-medium text-foreground">Reports</h1>
        <p className="text-sm text-foreground-light">Pipeline by stage for this project.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Deals', value: String(totalDeals) },
          { label: 'Open pipeline', value: money(openAmount) },
          { label: 'Won', value: money(won) },
        ].map((card) => (
          <div key={card.label} className="rounded-md border bg-surface-100 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-foreground-lighter">{card.label}</p>
            <p className="mt-1 text-xl font-medium text-foreground">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-surface-100 text-xs uppercase text-foreground-lighter">
            <tr>
              <th className="px-4 py-2 font-medium">Stage</th>
              <th className="px-4 py-2 font-medium">Deals</th>
              <th className="px-4 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {reportQuery.isPending ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-foreground-light">
                  Loading report…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-foreground-light">
                  No pipeline data yet
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.stage_id} className="border-b">
                  <td className="px-4 py-2">
                    {row.stage_name}
                    {row.is_won ? (
                      <span className="ml-2 text-xs text-foreground-lighter">won</span>
                    ) : null}
                    {row.is_lost ? (
                      <span className="ml-2 text-xs text-foreground-lighter">lost</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">{row.deal_count}</td>
                  <td className="px-4 py-2">{money(row.total_amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="border-t px-4 py-2 text-right text-sm text-foreground-light">
          Total {money(totalAmount)}
        </p>
      </div>
    </div>
  )
}

export function CrmAutomationsPanel({
  projectRef,
  stages,
  memberId,
  canWrite,
}: {
  projectRef?: string
  stages: CrmStage[]
  memberId?: string
  canWrite: boolean
}) {
  const { connection } = useCrmConnection({ projectRef })
  const automationsQuery = useCrmAutomationsQuery({ projectRef })
  const { mutateAsync: createRule, isPending: creating } = useCrmCreateAutomationMutation()
  const { mutate: toggleRule } = useCrmToggleAutomationMutation()

  const [name, setName] = useState('')
  const [triggerModule, setTriggerModule] = useState<'lead' | 'deal'>('lead')
  const [triggerValue, setTriggerValue] = useState<string>(CRM_LEAD_STATUSES[0] ?? 'Qualified')
  const [actionSubject, setActionSubject] = useState('Follow up')
  const [actionKind, setActionKind] = useState<CrmActivityKind>('task')

  const rules = automationsQuery.data ?? []
  const triggerOptions = useMemo(() => {
    if (triggerModule === 'lead') return [...CRM_LEAD_STATUSES]
    return stages.map((s) => s.name)
  }, [triggerModule, stages])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-1 border-b px-6 py-4">
        <h1 className="text-lg font-medium text-foreground">Automations</h1>
        <p className="text-sm text-foreground-light">
          When a lead hits a status or a deal moves to a stage, create an activity automatically.
        </p>
      </div>

      {canWrite ? (
        <form
          className="grid gap-2 border-b px-6 py-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            void createRule({
              ...connection,
              name,
              triggerModule,
              triggerValue,
              actionSubject,
              actionKind,
              createdBy: memberId,
            }).then(() => {
              setName('')
              setActionSubject('Follow up')
            })
          }}
        >
          <Input_Shadcn_
            value={name}
            placeholder="Rule name *"
            onChange={(e) => setName(e.target.value)}
            className={CRM_FOCUS_RING}
          />
          <select
            value={triggerModule}
            onChange={(e) => {
              const next = e.target.value as 'lead' | 'deal'
              setTriggerModule(next)
              setTriggerValue(
                next === 'lead' ? (CRM_LEAD_STATUSES[0] ?? 'Qualified') : (stages[0]?.name ?? '')
              )
            }}
            className={cn('h-9 rounded-md border bg-background px-2 text-sm', CRM_FOCUS_RING)}
          >
            <option value="lead">When lead status is…</option>
            <option value="deal">When deal stage is…</option>
          </select>
          <select
            value={triggerValue}
            onChange={(e) => setTriggerValue(e.target.value)}
            className={cn('h-9 rounded-md border bg-background px-2 text-sm', CRM_FOCUS_RING)}
          >
            {triggerOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <Input_Shadcn_
            value={actionSubject}
            placeholder="Activity subject *"
            onChange={(e) => setActionSubject(e.target.value)}
            className={CRM_FOCUS_RING}
          />
          <select
            value={actionKind}
            onChange={(e) => setActionKind(e.target.value as CrmActivityKind)}
            className={cn('h-9 rounded-md border bg-background px-2 text-sm', CRM_FOCUS_RING)}
          >
            <option value="task">Create task</option>
            <option value="call">Create call</option>
            <option value="meeting">Create meeting</option>
          </select>
          <Button
            type="primary"
            htmlType="submit"
            loading={creating}
            disabled={!name.trim() || !actionSubject.trim() || !triggerValue}
          >
            Add rule
          </Button>
        </form>
      ) : null}

      <ul className="min-h-0 flex-1 divide-y overflow-auto">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center justify-between gap-3 px-6 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{rule.name}</p>
              <p className="text-xs text-foreground-lighter">
                When {rule.trigger_module} → {rule.trigger_value}, create {rule.action_kind}:{' '}
                {rule.action_subject}
              </p>
            </div>
            {canWrite ? (
              <Button
                type={rule.enabled ? 'primary' : 'default'}
                size="tiny"
                onClick={() =>
                  toggleRule({
                    ...connection,
                    ruleId: rule.id,
                    enabled: !rule.enabled,
                  })
                }
              >
                {rule.enabled ? 'On' : 'Off'}
              </Button>
            ) : (
              <span className="text-xs text-foreground-lighter">
                {rule.enabled ? 'Enabled' : 'Disabled'}
              </span>
            )}
          </li>
        ))}
        {rules.length === 0 ? (
          <li className="px-6 py-10 text-center text-sm text-foreground-light">
            No automation rules yet
          </li>
        ) : null}
      </ul>
    </div>
  )
}
