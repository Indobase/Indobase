import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions, UseCustomQueryOptions } from 'types'
import { getCrmClient, hasCrmClientVariables, type CrmClientVariables } from './crm-client'
import { useCrmConnection } from './crm-connection'
import { crmKeys } from './keys'
import type { CrmNote, CrmRelatedModule } from './crm.types'

export const CRM_NOTE_COLUMNS =
  'id, project_ref, body, related_module, related_id, created_by, created_at'

export async function getCrmNotes(
  vars: CrmClientVariables & { relatedModule: CrmRelatedModule; relatedId: string },
  signal?: AbortSignal
): Promise<CrmNote[]> {
  const client = getCrmClient(vars)
  const query = client
    .from('notes')
    .select(CRM_NOTE_COLUMNS)
    .eq('related_module', vars.relatedModule)
    .eq('related_id', vars.relatedId)
    .order('created_at', { ascending: false })
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)
  return (data ?? []) as CrmNote[]
}

export const useCrmNotesQuery = (
  {
    projectRef,
    relatedModule,
    relatedId,
  }: {
    projectRef?: string
    relatedModule?: CrmRelatedModule
    relatedId?: string
  },
  { enabled = true, ...options }: UseCustomQueryOptions<CrmNote[], ResponseError> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })
  return useQuery({
    queryKey: crmKeys.notes(projectRef, relatedModule, relatedId),
    queryFn: ({ signal }) =>
      getCrmNotes(
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

export type CrmCreateNoteVariables = CrmClientVariables & {
  body: string
  relatedModule: CrmRelatedModule
  relatedId: string
  createdBy?: string | null
}

export async function createCrmNote({
  body,
  relatedModule,
  relatedId,
  createdBy,
  ...vars
}: CrmCreateNoteVariables): Promise<CrmNote> {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Note cannot be empty')
  const client = getCrmClient(vars)
  const { data, error } = await client
    .from('notes')
    .insert({
      body: trimmed,
      related_module: relatedModule,
      related_id: relatedId,
      created_by: createdBy ?? null,
    })
    .select(CRM_NOTE_COLUMNS)
    .single()
  if (error) handleError(error)
  return data as CrmNote
}

export const useCrmCreateNoteMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CrmNote, ResponseError, CrmCreateNoteVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: crmKeys.createNote(),
    mutationFn: (vars) => createCrmNote(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({
        queryKey: crmKeys.notes(variables.projectRef, variables.relatedModule, variables.relatedId),
      })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) toast.error(`Failed to add note: ${data.message}`)
      else onError(data, variables, context)
    },
    ...options,
  })
}
