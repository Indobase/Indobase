import { useQuery } from '@tanstack/react-query'

import { handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { getCrmClient, hasCrmClientVariables, type CrmClientVariables } from './crm-client'
import { useCrmConnection } from './crm-connection'
import { crmKeys } from './keys'
import type { CrmStage } from './crm.types'

export const CRM_STAGE_COLUMNS = 'id, project_ref, name, position, is_won, is_lost'

/**
 * The Kanban columns. Ordered by `position` — the pipeline's stage order is meaningful, not
 * incidental, so a raw name sort would silently scramble the board.
 */
export async function getCrmStages(
  vars: CrmClientVariables,
  signal?: AbortSignal
): Promise<CrmStage[]> {
  const client = getCrmClient(vars)

  const query = client.from('stages').select(CRM_STAGE_COLUMNS).order('position')

  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) handleError(error)

  return (data ?? []) as CrmStage[]
}

export type CrmStagesData = CrmStage[]
export type CrmStagesError = ResponseError

export const useCrmStagesQuery = <TData = CrmStagesData>(
  { projectRef }: { projectRef?: string },
  { enabled = true, ...options }: UseCustomQueryOptions<CrmStagesData, CrmStagesError, TData> = {}
) => {
  const { connection, isReady } = useCrmConnection({ projectRef })

  return useQuery<CrmStagesData, CrmStagesError, TData>({
    queryKey: crmKeys.stages(projectRef),
    queryFn: ({ signal }) => getCrmStages(connection, signal),
    enabled: enabled && isReady && hasCrmClientVariables(connection),
    staleTime: 60_000,
    ...options,
  })
}
