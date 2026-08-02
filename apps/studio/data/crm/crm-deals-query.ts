import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import { getCrmClient, hasCrmClientVariables, type CrmClientVariables } from './crm-client'
import { useCrmConnection } from './crm-connection'
import { crmKeys } from './keys'
import type { CrmDeal } from './crm.types'

export const CRM_DEAL_COLUMNS =
  'id, project_ref, stage_id, company_id, contact_id, title, amount, currency, probability, closing_date, lead_source, description, created_by, created_at, updated_at'

export async function getCrmDeals(
  vars: CrmClientVariables,
  signal?: AbortSignal
): Promise<CrmDeal[]> {
  const client = getCrmClient(vars)
  const query = client.from('deals').select(CRM_DEAL_COLUMNS).order('updated_at', { ascending: false })
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)
  return (data ?? []) as CrmDeal[]
}

export const useCrmDealsQuery = <TData = CrmDeal[]>(
  { projectRef }: { projectRef?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<CrmDeal[], ResponseError, TData> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })

  return useQuery({
    queryKey: crmKeys.deals(projectRef),
    queryFn: ({ signal }) => getCrmDeals(connection, signal),
    enabled: enabled && isReady && hasCrmClientVariables(connection),
    ...options,
  })
}

export type CrmCreateDealVariables = CrmClientVariables & {
  title: string
  stageId: string
  amount?: number | null
  currency?: string
  companyId?: string | null
  contactId?: string | null
  createdBy?: string | null
}

export async function createCrmDeal({
  title,
  stageId,
  amount,
  currency = 'INR',
  companyId,
  contactId,
  createdBy,
  ...vars
}: CrmCreateDealVariables): Promise<CrmDeal> {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Deal title is required')
  if (!stageId) throw new Error('Stage is required')

  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('deals')
    .insert({
      title: trimmed,
      stage_id: stageId,
      amount: amount ?? null,
      currency,
      company_id: companyId ?? null,
      contact_id: contactId ?? null,
      created_by: createdBy ?? null,
    })
    .select(CRM_DEAL_COLUMNS)
    .single()
  if (error) handleError(error)
  return data as CrmDeal
}

export const useCrmCreateDealMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmDeal, ResponseError, CrmCreateDealVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: crmKeys.createDeal(),
    mutationFn: (vars) => createCrmDeal(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: crmKeys.deals(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to create deal: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export type CrmUpdateDealStageVariables = CrmClientVariables & {
  dealId: string
  stageId: string
}

export async function updateCrmDealStage({
  dealId,
  stageId,
  ...vars
}: CrmUpdateDealStageVariables): Promise<CrmDeal> {
  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('deals')
    .update({ stage_id: stageId })
    .eq('id', dealId)
    .select(CRM_DEAL_COLUMNS)
    .single()
  if (error) handleError(error)
  return data as CrmDeal
}

export const useCrmUpdateDealStageMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmDeal, ResponseError, CrmUpdateDealStageVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: crmKeys.updateDealStage(),
    mutationFn: (vars) => updateCrmDealStage(vars),
    async onSuccess(data, variables, context) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: crmKeys.deals(variables.projectRef) }),
        queryClient.invalidateQueries({ queryKey: crmKeys.activities(variables.projectRef) }),
        queryClient.invalidateQueries({ queryKey: crmKeys.pipelineReport(variables.projectRef) }),
      ])
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to move deal: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}
