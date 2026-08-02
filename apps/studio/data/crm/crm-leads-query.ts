import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import { getCrmClient, hasCrmClientVariables, type CrmClientVariables } from './crm-client'
import { useCrmConnection } from './crm-connection'
import { crmKeys } from './keys'
import type { CrmLead, CrmLeadStatus } from './crm.types'

export const CRM_LEAD_COLUMNS =
  'id, project_ref, full_name, email, phone, company_name, title, lead_source, status, description, converted_contact_id, converted_company_id, converted_deal_id, converted_at, created_by, created_at, updated_at'

export async function getCrmLeads(
  vars: CrmClientVariables,
  signal?: AbortSignal
): Promise<CrmLead[]> {
  const client = getCrmClient(vars)
  const query = client.from('leads').select(CRM_LEAD_COLUMNS).order('updated_at', { ascending: false })
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)
  return (data ?? []) as CrmLead[]
}

export const useCrmLeadsQuery = <TData = CrmLead[]>(
  { projectRef }: { projectRef?: string },
  { enabled = true, ...options }: UseCustomQueryOptions<CrmLead[], ResponseError, TData> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })
  return useQuery({
    queryKey: crmKeys.leads(projectRef),
    queryFn: ({ signal }) => getCrmLeads(connection, signal),
    enabled: enabled && isReady && hasCrmClientVariables(connection),
    ...options,
  })
}

export type CrmCreateLeadVariables = CrmClientVariables & {
  fullName: string
  email?: string | null
  phone?: string | null
  companyName?: string | null
  title?: string | null
  leadSource?: string | null
  status?: CrmLeadStatus
  description?: string | null
  createdBy?: string | null
}

export async function createCrmLead({
  fullName,
  email,
  phone,
  companyName,
  title,
  leadSource,
  status = 'Open',
  description,
  createdBy,
  ...vars
}: CrmCreateLeadVariables): Promise<CrmLead> {
  const trimmed = fullName.trim()
  if (!trimmed) throw new Error('Lead name is required')
  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('leads')
    .insert({
      full_name: trimmed,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      company_name: companyName?.trim() || null,
      title: title?.trim() || null,
      lead_source: leadSource?.trim() || null,
      status,
      description: description?.trim() || null,
      created_by: createdBy ?? null,
    })
    .select(CRM_LEAD_COLUMNS)
    .single()
  if (error) handleError(error)
  return data as CrmLead
}

export const useCrmCreateLeadMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmLead, ResponseError, CrmCreateLeadVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: crmKeys.createLead(),
    mutationFn: (vars) => createCrmLead(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: crmKeys.leads(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to create lead: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export type CrmUpdateLeadVariables = CrmClientVariables & {
  leadId: string
  patch: Partial<{
    full_name: string
    email: string | null
    phone: string | null
    company_name: string | null
    title: string | null
    lead_source: string | null
    status: CrmLeadStatus
    description: string | null
  }>
}

export async function updateCrmLead({
  leadId,
  patch,
  ...vars
}: CrmUpdateLeadVariables): Promise<CrmLead> {
  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('leads')
    .update(patch)
    .eq('id', leadId)
    .select(CRM_LEAD_COLUMNS)
    .single()
  if (error) handleError(error)
  return data as CrmLead
}

export const useCrmUpdateLeadMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmLead, ResponseError, CrmUpdateLeadVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: crmKeys.updateLead(),
    mutationFn: (vars) => updateCrmLead(vars),
    async onSuccess(data, variables, context) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: crmKeys.leads(variables.projectRef) }),
        queryClient.invalidateQueries({ queryKey: crmKeys.activities(variables.projectRef) }),
      ])
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to update lead: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export type CrmConvertLeadVariables = CrmClientVariables & {
  leadId: string
  dealTitle?: string | null
  stageId?: string | null
  amount?: number | null
}

export async function convertCrmLead({
  leadId,
  dealTitle,
  stageId,
  amount,
  ...vars
}: CrmConvertLeadVariables) {
  const client = getCrmClient(vars)
  const { data, error } = await client.rpc('convert_lead', {
    p_lead_id: leadId,
    p_deal_title: dealTitle?.trim() || null,
    p_stage_id: stageId || null,
    p_amount: amount ?? null,
  })
  if (error) handleError(error)
  return data as { contact_id: string | null; company_id: string | null; deal_id: string | null }
}

export const useCrmConvertLeadMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<
    { contact_id: string | null; company_id: string | null; deal_id: string | null },
    ResponseError,
    CrmConvertLeadVariables
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: crmKeys.convertLead(),
    mutationFn: (vars) => convertCrmLead(vars),
    async onSuccess(data, variables, context) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: crmKeys.leads(variables.projectRef) }),
        queryClient.invalidateQueries({ queryKey: crmKeys.contacts(variables.projectRef) }),
        queryClient.invalidateQueries({ queryKey: crmKeys.companies(variables.projectRef) }),
        queryClient.invalidateQueries({ queryKey: crmKeys.deals(variables.projectRef) }),
        queryClient.invalidateQueries({ queryKey: crmKeys.activities(variables.projectRef) }),
      ])
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to convert lead: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}
