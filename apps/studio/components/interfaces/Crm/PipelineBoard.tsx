import { useMemo, useState } from 'react'

import type { CrmCompany, CrmDeal, CrmStage } from 'data/crm/crm.types'
import { Button, Input_Shadcn_, cn } from 'ui'

import { CRM_FOCUS_RING } from './Crm.constants'

function formatAmount(amount: number | null, currency: string) {
  if (amount === null || amount === undefined) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0,
    }).format(Number(amount))
  } catch {
    return `${amount} ${currency}`
  }
}

interface PipelineBoardProps {
  stages: CrmStage[]
  deals: CrmDeal[]
  companies: CrmCompany[]
  canWrite: boolean
  isCreating: boolean
  onSelectDeal: (id: string) => void
  onCreateDeal: (input: {
    title: string
    stageId: string
    amount?: number | null
  }) => Promise<boolean>
  onMoveDeal: (dealId: string, stageId: string) => void
}

export const PipelineBoard = ({
  stages,
  deals,
  companies,
  canWrite,
  isCreating,
  onSelectDeal,
  onCreateDeal,
  onMoveDeal,
}: PipelineBoardProps) => {
  const ordered = useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages])
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const companyById = useMemo(() => {
    const map = new Map<string, CrmCompany>()
    for (const row of companies) map.set(row.id, row)
    return map
  }, [companies])

  const defaultStageId = ordered.find((s) => !s.is_won && !s.is_lost)?.id ?? ordered[0]?.id

  return (
    <div className="flex h-full min-h-0 flex-col">
      {canWrite ? (
        <form
          className="flex shrink-0 flex-wrap items-end gap-2 border-b px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!defaultStageId) return
            void onCreateDeal({
              title,
              stageId: defaultStageId,
              amount: amount.trim() ? Number(amount) : null,
            }).then((ok) => {
              if (ok) {
                setTitle('')
                setAmount('')
              }
            })
          }}
        >
          <Input_Shadcn_
            value={title}
            placeholder="New deal"
            onChange={(e) => setTitle(e.target.value)}
            className={cn('min-w-[12rem] flex-1', CRM_FOCUS_RING)}
          />
          <Input_Shadcn_
            value={amount}
            placeholder="Amount"
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            className={cn('w-28', CRM_FOCUS_RING)}
          />
          <Button type="primary" htmlType="submit" loading={isCreating} disabled={!title.trim()}>
            Create
          </Button>
        </form>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {ordered.map((stage) => {
          const columnDeals = deals.filter((deal) => deal.stage_id === stage.id)
          return (
            <section
              key={stage.id}
              className="flex w-64 shrink-0 flex-col rounded-md border bg-surface-100"
            >
              <header className="flex items-center justify-between border-b px-3 py-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-foreground-light">
                  {stage.name}
                </h3>
                <span className="text-xs text-foreground-lighter">{columnDeals.length}</span>
              </header>
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {columnDeals.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs text-foreground-lighter">No deals</li>
                ) : (
                  columnDeals.map((deal) => (
                    <li key={deal.id}>
                      <button
                        type="button"
                        onClick={() => onSelectDeal(deal.id)}
                        className={cn(
                          'w-full rounded-md border bg-background p-2.5 text-left shadow-sm hover:bg-surface-100',
                          CRM_FOCUS_RING
                        )}
                      >
                        <p className="text-sm font-medium text-foreground">{deal.title}</p>
                        <p className="mt-0.5 text-xs text-foreground-light">
                          {formatAmount(deal.amount, deal.currency)}
                          {deal.company_id
                            ? ` · ${companyById.get(deal.company_id)?.name ?? 'Account'}`
                            : ''}
                        </p>
                      </button>
                      {canWrite ? (
                        <select
                          className={cn(
                            'mt-1 w-full rounded border bg-surface-100 px-2 py-1 text-xs',
                            CRM_FOCUS_RING
                          )}
                          value={deal.stage_id}
                          onChange={(event) => onMoveDeal(deal.id, event.target.value)}
                        >
                          {ordered.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
