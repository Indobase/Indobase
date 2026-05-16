import { useQuery } from '@tanstack/react-query'

import { IS_SAAS } from 'lib/constants'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { serviceStatusKeys } from './keys'

export type EdgeFunctionServiceStatusVariables = {
  projectRef?: string
}

export async function getEdgeFunctionServiceStatus(signal?: AbortSignal) {
  // Indobase SaaS runs edge functions in the same compose stack as Studio — don't
  // probe a third-party Supabase URL from the user's browser.
  if (IS_SAAS) return { healthy: true }

  try {
    const res = await fetch('https://obuldanrptloktxcffvn.supabase.co/functions/v1/health-check', {
      method: 'GET',
      signal,
    })
    const response = await res.json()
    return response as { healthy: boolean }
  } catch (err) {
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
    queryFn: ({ signal }) => getEdgeFunctionServiceStatus(signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
