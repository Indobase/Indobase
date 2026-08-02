import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import { getCrmClient, hasCrmClientVariables, type CrmClientVariables } from './crm-client'
import { useCrmConnection } from './crm-connection'
import { crmKeys } from './keys'
import type {
  CrmActivity,
  CrmActivityKind,
  CrmActivityStatus,
  CrmRelatedModule,
} from './crm.types'

export const CRM_ACTIVITY_COLUMNS =
  'id, project_ref, kind, subject, status, due_at, description, related_module, related_id, created_by, created_at, updated_at'

export async function getCrmActivities(
  vars: CrmClientVariables,
  signal?: AbortSignal
): Promise<CrmActivity[]> {
  const client = getCrmClient(vars)
  const query = client
    .from('activities')
    .select(CRM_ACTIVITY_COLUMNS)
    .order('created_at', { ascending: false })
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)
  return (data ?? []) as CrmActivity[]
}

export const useCrmActivitiesQuery = <TData = CrmActivity[]>(
  { projectRef }: { projectRef?: string },
  { enabled = true, ...options }: UseCustomQueryOptions<CrmActivity[], ResponseError, TData> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })
  return useQuery({
    queryKey: crmKeys.activities(projectRef),
    queryFn: ({ signal }) => getCrmActivities(connection, signal),
    enabled: enabled && isReady && hasCrmClientVariables(connection),
    ...options,
  })
}

export type CrmCreateActivityVariables = CrmClientVariables & {
  kind: CrmActivityKind
  subject: string
  status?: CrmActivityStatus
  dueAt?: string | null
  description?: string | null
  relatedModule?: CrmRelatedModule | null
  relatedId?: string | null
  createdBy?: string | null
}

export async function createCrmActivity({
  kind,
  subject,
  status = 'Not Started',
  dueAt,
  description,
  relatedModule,
  relatedId,
  createdBy,
  ...vars
}: CrmCreateActivityVariables): Promise<CrmActivity> {
  const trimmed = subject.trim()
  if (!trimmed) throw new Error('Activity subject is required')
  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('activities')
    .insert({
      kind,
      subject: trimmed,
      status,
      due_at: dueAt || null,
      description: description?.trim() || null,
      related_module: relatedModule ?? null,
      related_id: relatedId ?? null,
      created_by: createdBy ?? null,
    })
    .select(CRM_ACTIVITY_COLUMNS)
    .single()
  if (error) handleError(error)
  return data as CrmActivity
}

export const useCrmCreateActivityMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmActivity, ResponseError, CrmCreateActivityVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: crmKeys.createActivity(),
    mutationFn: (vars) => createCrmActivity(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: crmKeys.activities(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to create activity: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export type CrmUpdateActivityVariables = CrmClientVariables & {
  activityId: string
  status: CrmActivityStatus
}

export async function updateCrmActivityStatus({
  activityId,
  status,
  ...vars
}: CrmUpdateActivityVariables): Promise<CrmActivity> {
  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('activities')
    .update({ status })
    .eq('id', activityId)
    .select(CRM_ACTIVITY_COLUMNS)
    .single()
  if (error) handleError(error)
  return data as CrmActivity
}

export const useCrmUpdateActivityMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmActivity, ResponseError, CrmUpdateActivityVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: crmKeys.updateActivity(),
    mutationFn: (vars) => updateCrmActivityStatus(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: crmKeys.activities(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to update activity: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}
