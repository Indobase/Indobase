import { useQuery } from '@tanstack/react-query'

import { components } from 'api-types'
import { get, handleError } from 'data/fetchers'
import { IS_PLATFORM } from 'lib/constants'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { serviceStatusKeys } from './keys'

export type ProjectServiceStatusVariables = {
  projectRef?: string
}

// Omit the 'healthy' field as it's equivalent to status = 'ACTIVE_HEALTHY'
export type ServiceHealthResponse = Omit<
  components['schemas']['V1ServiceHealthResponse'],
  'healthy'
>
export type ProjectServiceStatus = ServiceHealthResponse['status']

export async function getProjectServiceStatus(
  { projectRef }: ProjectServiceStatusVariables,
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('projectRef is required')

  // Self-hosted (incl. Indobase SaaS) doesn't have the cloud `/v1/.../health`
  // endpoint. Report all five core services as healthy — the data plane runs
  // in the same compose stack as Studio, so if Studio is up, they're up.
  if (!IS_PLATFORM) {
    const services: NonNullable<ServiceHealthResponse['name']>[] = [
      'auth',
      'realtime',
      'rest',
      'storage',
      'db',
    ]
    return services.map(
      (name) =>
        ({
          name,
          status: 'ACTIVE_HEALTHY',
          info: undefined,
          error: undefined,
        }) as unknown as ServiceHealthResponse
    )
  }

  const { data, error } = await get(`/v1/projects/{ref}/health`, {
    params: {
      path: { ref: projectRef },
      query: {
        services: ['auth', 'realtime', 'rest', 'storage', 'db'],
      },
    },
    signal,
  })

  if (error) handleError(error)

  return data as ServiceHealthResponse[]
}

export type ProjectServiceStatusData = Awaited<ReturnType<typeof getProjectServiceStatus>>
export type ProjectServiceStatusError = ResponseError

export const useProjectServiceStatusQuery = <TData = ProjectServiceStatusData>(
  { projectRef }: ProjectServiceStatusVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<ProjectServiceStatusData, ProjectServiceStatusError, TData> = {}
) =>
  useQuery<ProjectServiceStatusData, ProjectServiceStatusError, TData>({
    queryKey: serviceStatusKeys.serviceStatus(projectRef),
    queryFn: ({ signal }) => getProjectServiceStatus({ projectRef }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
