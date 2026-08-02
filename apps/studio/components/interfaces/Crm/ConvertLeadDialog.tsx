import { useState } from 'react'

import type { CrmStage } from 'data/crm/crm.types'
import { Button, Input_Shadcn_, cn } from 'ui'

import { CRM_FOCUS_RING } from './Crm.constants'

interface ConvertLeadDialogProps {
  leadName: string
  stages: CrmStage[]
  loading: boolean
  onCancel: () => void
  onConvert: (values: {
    dealTitle: string
    stageId: string | null
    amount: number | null
  }) => Promise<void>
}

export const ConvertLeadDialog = ({
  leadName,
  stages,
  loading,
  onCancel,
  onConvert,
}: ConvertLeadDialogProps) => {
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost)
  const defaultStage = openStages[0]?.id ?? stages[0]?.id ?? ''
  const [dealTitle, setDealTitle] = useState(`${leadName} — opportunity`)
  const [stageId, setStageId] = useState(defaultStage)
  const [amount, setAmount] = useState('')

  return (
    <div className="rounded-md border bg-surface-100 p-4">
      <h3 className="text-sm font-medium text-foreground">Convert lead</h3>
      <p className="mt-1 text-xs text-foreground-light">
        Creates a contact (and account if company is set), optionally a deal, and marks the lead
        converted.
      </p>
      <div className="mt-3 space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-foreground-light">Deal title</span>
          <Input_Shadcn_
            value={dealTitle}
            onChange={(e) => setDealTitle(e.target.value)}
            className={CRM_FOCUS_RING}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-foreground-light">Pipeline stage</span>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            className={cn('w-full rounded-md border bg-background px-2 py-1.5', CRM_FOCUS_RING)}
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-foreground-light">Amount (optional)</span>
          <Input_Shadcn_
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={CRM_FOCUS_RING}
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="default" size="tiny" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="primary"
            size="tiny"
            loading={loading}
            disabled={!dealTitle.trim()}
            onClick={() =>
              void onConvert({
                dealTitle: dealTitle.trim(),
                stageId: stageId || null,
                amount: amount.trim() ? Number(amount) : null,
              })
            }
          >
            Convert
          </Button>
        </div>
      </div>
    </div>
  )
}
