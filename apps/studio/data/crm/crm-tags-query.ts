import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import { getCrmClient, hasCrmClientVariables, type CrmClientVariables } from './crm-client'
import { useCrmConnection } from './crm-connection'
import { crmKeys } from './keys'
import type { CrmRecordTag, CrmRelatedModule, CrmTag } from './crm.types'

export const CRM_TAG_COLUMNS = 'id, project_ref, name, color, created_at'

export async function getCrmTags(vars: CrmClientVariables, signal?: AbortSignal): Promise<CrmTag[]> {
  const client = getCrmClient(vars)
  const query = client.from('tags').select(CRM_TAG_COLUMNS).order('name')
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)
  return (data ?? []) as CrmTag[]
}

export const useCrmTagsQuery = (
  { projectRef }: { projectRef?: string },
  { enabled = true, ...options }: UseCustomQueryOptions<CrmTag[], ResponseError> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })
  return useQuery({
    queryKey: crmKeys.tags(projectRef),
    queryFn: ({ signal }) => getCrmTags(connection, signal),
    enabled: enabled && isReady && hasCrmClientVariables(connection),
    ...options,
  })
}

export async function createCrmTag({
  name,
  color = '#3B8FD6',
  ...vars
}: CrmClientVariables & { name: string; color?: string }): Promise<CrmTag> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Tag name is required')
  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('tags')
    .insert({ name: trimmed, color })
    .select(CRM_TAG_COLUMNS)
    .single()
  if (error) handleError(error)
  return data as CrmTag
}

export const useCrmCreateTagMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmTag, ResponseError, CrmClientVariables & { name: string; color?: string }>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['crm', 'create-tag'],
    mutationFn: (vars) => createCrmTag(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: crmKeys.tags(variables.projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to create tag: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}

export async function getCrmRecordTags(
  vars: CrmClientVariables & { relatedModule: CrmRelatedModule; relatedId: string },
  signal?: AbortSignal
): Promise<CrmRecordTag[]> {
  const client = getCrmClient(vars)
  const query = client
    .from('record_tags')
    .select('tag_id, related_module, related_id, created_at')
    .eq('related_module', vars.relatedModule)
    .eq('related_id', vars.relatedId)
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)
  return (data ?? []) as CrmRecordTag[]
}

export const useCrmRecordTagsQuery = (
  {
    projectRef,
    relatedModule,
    relatedId,
  }: {
    projectRef?: string
    relatedModule?: CrmRelatedModule
    relatedId?: string
  },
  { enabled = true, ...options }: UseCustomQueryOptions<CrmRecordTag[], ResponseError> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })
  return useQuery({
    queryKey: crmKeys.recordTags(projectRef, relatedModule, relatedId),
    queryFn: ({ signal }) =>
      getCrmRecordTags(
        { ...connection, relatedModule: relatedModule!, relatedId: relatedId! },
        signal
      ),
    enabled:
      enabled &&
      isReady &&
      hasCrmClientVariables(connection) &&
      !!relatedModule &&
      !!relatedId,
    ...options,
  })
}

export async function assignCrmTag({
  tagId,
  relatedModule,
  relatedId,
  ...vars
}: CrmClientVariables & {
  tagId: string
  relatedModule: CrmRelatedModule
  relatedId: string
}): Promise<void> {
  const client = getCrmClient(vars)
  const { error } = await client.from('record_tags').insert({
    tag_id: tagId,
    related_module: relatedModule,
    related_id: relatedId,
  })
  if (error) handleError(error)
}

export async function unassignCrmTag({
  tagId,
  relatedModule,
  relatedId,
  ...vars
}: CrmClientVariables & {
  tagId: string
  relatedModule: CrmRelatedModule
  relatedId: string
}): Promise<void> {
  const client = getCrmClient(vars)
  const { error } = await client
    .from('record_tags')
    .delete()
    .eq('tag_id', tagId)
    .eq('related_module', relatedModule)
    .eq('related_id', relatedId)
  if (error) handleError(error)
}

export const useCrmToggleRecordTagMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<
    void,
    ResponseError,
    CrmClientVariables & {
      tagId: string
      relatedModule: CrmRelatedModule
      relatedId: string
      assigned: boolean
    }
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['crm', 'toggle-record-tag'],
    mutationFn: async (vars) => {
      if (vars.assigned) {
        await unassignCrmTag(vars)
      } else {
        await assignCrmTag(vars)
      }
    },
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({
        queryKey: crmKeys.recordTags(
          variables.projectRef,
          variables.relatedModule,
          variables.relatedId
        ),
      })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to update tags: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}
