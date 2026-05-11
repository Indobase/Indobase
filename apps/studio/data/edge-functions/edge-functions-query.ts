import { useQuery } from '@tanstack/react-query'
import { components } from 'api-types'
import { get, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { edgeFunctionsKeys } from './keys'

export type EdgeFunctionsVariables = { projectRef?: string }

export type EdgeFunctionsResponse = components['schemas']['FunctionResponse']

export async function getEdgeFunctions(
  { projectRef }: EdgeFunctionsVariables,
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('projectRef is required')

  // Note: in SaaS Studio, `/v1/projects/{ref}/functions` is served
  // locally by `apps/studio/pages/api/v1/projects/[ref]/functions/index.ts`,
  // which reads from the EDGE_FUNCTIONS_MANAGEMENT_FOLDER. No cloud round-trip.
  const { data, error } = await get(`/v1/projects/{ref}/functions`, {
    params: { path: { ref: projectRef } },
    signal,
  })

  if (error) handleError(error)
  return data
}

export type EdgeFunctionsData = Awaited<ReturnType<typeof getEdgeFunctions>>
export type EdgeFunctionsError = ResponseError

export const useEdgeFunctionsQuery = <TData = EdgeFunctionsData>(
  { projectRef }: EdgeFunctionsVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<EdgeFunctionsData, EdgeFunctionsError, TData> = {}
) =>
  useQuery<EdgeFunctionsData, EdgeFunctionsError, TData>({
    queryKey: edgeFunctionsKeys.list(projectRef),
    queryFn: ({ signal }) => getEdgeFunctions({ projectRef }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
