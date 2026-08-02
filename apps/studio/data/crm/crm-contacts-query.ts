import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import { getCrmClient, hasCrmClientVariables, type CrmClientVariables } from './crm-client'
import { useCrmConnection } from './crm-connection'
import { crmKeys } from './keys'
import type { CrmContact } from './crm.types'

export const CRM_CONTACT_COLUMNS =
  'id, project_ref, company_id, full_name, email, phone, title, lead_source, description, created_by, created_at, updated_at'

export async function getCrmContacts(
  vars: CrmClientVariables,
  signal?: AbortSignal
): Promise<CrmContact[]> {
  const client = getCrmClient(vars)

  const query = client.from('contacts').select(CRM_CONTACT_COLUMNS).order('full_name')

  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)

  return (data ?? []) as CrmContact[]
}

export type CrmContactsData = CrmContact[]
export type CrmContactsError = ResponseError

export const useCrmContactsQuery = <TData = CrmContactsData>(
  { projectRef }: { projectRef?: string },
  { enabled = true, ...options }: UseCustomQueryOptions<CrmContactsData, CrmContactsError, TData> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })

  return useQuery<CrmContactsData, CrmContactsError, TData>({
    queryKey: crmKeys.contacts(projectRef),
    queryFn: ({ signal }) => getCrmContacts(connection, signal),
    enabled: enabled && isReady && hasCrmClientVariables(connection),
    ...options,
  })
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────────

export type CrmCreateContactVariables = CrmClientVariables & {
  fullName: string
  email?: string | null
  phone?: string | null
  companyId?: string | null
  createdBy?: string | null
}

export async function createCrmContact({
  fullName,
  email,
  phone,
  companyId,
  createdBy,
  ...vars
}: CrmCreateContactVariables): Promise<CrmContact> {
  const trimmed = fullName.trim()
  if (!trimmed) throw new Error('Contact name is required')

  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('contacts')
    .insert({
      full_name: trimmed,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      company_id: companyId || null,
      created_by: createdBy ?? null,
    })
    .select(CRM_CONTACT_COLUMNS)
    .single()

  if (error) handleError(error)
  return data as CrmContact
}

export const useCrmCreateContactMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmContact, ResponseError, CrmCreateContactVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<CrmContact, ResponseError, CrmCreateContactVariables>({
    mutationKey: crmKeys.createContact(),
    mutationFn: (vars) => createCrmContact(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: crmKeys.contacts(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to create contact: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}
