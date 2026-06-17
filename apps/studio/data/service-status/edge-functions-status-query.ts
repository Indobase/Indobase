import { useQuery } from '@tanstack/react-query'

import { get } from 'data/fetchers'
import { IS_SAAS } from 'lib/constants'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { serviceStatusKeys } from './keys'

export type EdgeFunctionServiceStatusVariables = {
  projectRef?: string
}

export async function getEdgeFunctionServiceStatus(
  { projectRef }: EdgeFunctionServiceStatusVariables,
  signal?: AbortSignal
) {
  if (IS_SAAS) {
    if (!projectRef) throw new Error('projectRef is required')

    const { data, error } = await get('/v1/projects/{ref}/edge-functions-health', {
      params: { path: { ref: projectRef } },
      signal,
    })

    if (error) {
      return { healthy: false }
    }

    return (data ?? { healthy: false }) as { healthy: boolean }
  }

  try {
    const res = await fetch('https://obuldanrptloktxcffvn.indobase.in/functions/v1/health-check', {
      method: 'GET',
      signal,
    })
    const response = await res.json()
    return response as { healthy: boolean }
  } catch {
    return { healthy: false }
  }
}

export type EdgeFunctionServiceStatusData = Awaited<ReturnType<typeof getEdgeFunctionServiceStatus>>
export type EdgeFunctionServiceStatusError = ResponseError

export const useEdgeFunctionServiceStatusQuery = <TData = EdgeFunctionServiceStatusData>(
  { projectRef }: EdgeFunctionServiceStatusVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<
    EdgeFunctionServiceStatusData,
    EdgeFunctionServiceStatusError,
    TData
  > = {}
) =>
  useQuery<EdgeFunctionServiceStatusData, EdgeFunctionServiceStatusError, TData>({
    queryKey: serviceStatusKeys.edgeFunctions(projectRef),
    queryFn: ({ signal }) => getEdgeFunctionServiceStatus({ projectRef }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
