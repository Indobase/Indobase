import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import { getCrmClient, hasCrmClientVariables, type CrmClientVariables } from './crm-client'
import { useCrmConnection } from './crm-connection'
import { crmKeys } from './keys'
import type { CrmCompany } from './crm.types'

export const CRM_COMPANY_COLUMNS =
  'id, project_ref, name, website, industry, phone, city, description, created_by, created_at, updated_at'

export async function getCrmCompanies(
  vars: CrmClientVariables,
  signal?: AbortSignal
): Promise<CrmCompany[]> {
  const client = getCrmClient(vars)

  const query = client.from('companies').select(CRM_COMPANY_COLUMNS).order('name')

  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)

  return (data ?? []) as CrmCompany[]
}

export type CrmCompaniesData = CrmCompany[]
export type CrmCompaniesError = ResponseError

export const useCrmCompaniesQuery = <TData = CrmCompaniesData>(
  { projectRef }: { projectRef?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<CrmCompaniesData, CrmCompaniesError, TData> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })

  return useQuery<CrmCompaniesData, CrmCompaniesError, TData>({
    queryKey: crmKeys.companies(projectRef),
    queryFn: ({ signal }) => getCrmCompanies(connection, signal),
    enabled: enabled && isReady && hasCrmClientVariables(connection),
    ...options,
  })
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────────

export type CrmCreateCompanyVariables = CrmClientVariables & {
  name: string
  website?: string | null
  industry?: string | null
  phone?: string | null
  city?: string | null
  description?: string | null
  createdBy?: string | null
}

export async function createCrmCompany({
  name,
  website,
  industry,
  phone,
  city,
  description,
  createdBy,
  ...vars
}: CrmCreateCompanyVariables): Promise<CrmCompany> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Company name is required')

  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('companies')
    .insert({
      name: trimmed,
      website: website?.trim() || null,
      industry: industry?.trim() || null,
      phone: phone?.trim() || null,
      city: city?.trim() || null,
      description: description?.trim() || null,
      created_by: createdBy ?? null,
    })
    .select(CRM_COMPANY_COLUMNS)
    .single()

  if (error) handleError(error)
  return data as CrmCompany
}

export const useCrmCreateCompanyMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmCompany, ResponseError, CrmCreateCompanyVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<CrmCompany, ResponseError, CrmCreateCompanyVariables>({
    mutationKey: crmKeys.createCompany(),
    mutationFn: (vars) => createCrmCompany(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: crmKeys.companies(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to create company: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}
