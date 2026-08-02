import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import { getCrmClient, hasCrmClientVariables, type CrmClientVariables } from './crm-client'
import { useCrmConnection } from './crm-connection'
import { crmKeys } from './keys'
import type { CrmActivityKind, CrmAutomationRule, CrmPipelineReportRow } from './crm.types'

export const CRM_AUTOMATION_COLUMNS =
  'id, project_ref, name, enabled, trigger_module, trigger_value, action_subject, action_kind, created_by, created_at'

export async function getCrmAutomations(
  vars: CrmClientVariables,
  signal?: AbortSignal
): Promise<CrmAutomationRule[]> {
  const client = getCrmClient(vars)
  const query = client.from('automation_rules').select(CRM_AUTOMATION_COLUMNS).order('created_at', {
    ascending: false,
  })
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)
  return (data ?? []) as CrmAutomationRule[]
}

export const useCrmAutomationsQuery = (
  { projectRef }: { projectRef?: string },
  { enabled = true, ...options }: UseCustomQueryOptions<CrmAutomationRule[], ResponseError> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })
  return useQuery({
    queryKey: crmKeys.automations(projectRef),
    queryFn: ({ signal }) => getCrmAutomations(connection, signal),
    enabled: enabled && isReady && hasCrmClientVariables(connection),
    ...options,
  })
}

export type CrmCreateAutomationVariables = CrmClientVariables & {
  name: string
  triggerModule: 'lead' | 'deal'
  triggerValue: string
  actionSubject: string
  actionKind?: CrmActivityKind
  createdBy?: string | null
}

export async function createCrmAutomation({
  name,
  triggerModule,
  triggerValue,
  actionSubject,
  actionKind = 'task',
  createdBy,
  ...vars
}: CrmCreateAutomationVariables): Promise<CrmAutomationRule> {
  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('automation_rules')
    .insert({
      name: name.trim(),
      trigger_module: triggerModule,
      trigger_value: triggerValue.trim(),
      action_subject: actionSubject.trim(),
      action_kind: actionKind,
      enabled: true,
      created_by: createdBy ?? null,
    })
    .select(CRM_AUTOMATION_COLUMNS)
    .single()
  if (error) handleError(error)
  return data as CrmAutomationRule
}

export const useCrmCreateAutomationMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmAutomationRule, ResponseError, CrmCreateAutomationVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['crm', 'create-automation'],
    mutationFn: (vars) => createCrmAutomation(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: crmKeys.automations(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to create automation: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export async function setCrmAutomationEnabled({
  ruleId,
  enabled,
  ...vars
}: CrmClientVariables & { ruleId: string; enabled: boolean }): Promise<void> {
  const client = getCrmClient(vars)
  const { error } = await client.from('automation_rules').update({ enabled }).eq('id', ruleId)
  if (error) handleError(error)
}

export const useCrmToggleAutomationMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<
    void,
    ResponseError,
    CrmClientVariables & { ruleId: string; enabled: boolean }
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['crm', 'toggle-automation'],
    mutationFn: (vars) => setCrmAutomationEnabled(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: crmKeys.automations(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to update automation: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export async function getCrmPipelineReport(
  vars: CrmClientVariables
): Promise<CrmPipelineReportRow[]> {
  const client = getCrmClient(vars)
  const { data, error } = await client.rpc('pipeline_report')
  if (error) handleError(error)
  return ((data ?? []) as CrmPipelineReportRow[]).map((row) => ({
    ...row,
    deal_count: Number(row.deal_count),
    total_amount: Number(row.total_amount),
  }))
}

export const useCrmPipelineReportQuery = (
  { projectRef }: { projectRef?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<CrmPipelineReportRow[], ResponseError> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })
  return useQuery({
    queryKey: crmKeys.pipelineReport(projectRef),
    queryFn: () => getCrmPipelineReport(connection),
    enabled: enabled && isReady && hasCrmClientVariables(connection),
    refetchInterval: 30_000,
    ...options,
  })
}
