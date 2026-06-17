import { useQuery } from '@tanstack/react-query'

import { get, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'

export type ProjectDeployment = {
  completed_at: string | null
  custom_domain_hostname: string | null
  id: string
  inserted_at: string
  last_error: string | null
  logs: {
    level: 'info' | 'warning' | 'error'
    message: string
    source: 'api' | 'builder' | 'runtime' | 'studio'
    timestamp: string
  }[]
  metadata: Record<string, unknown>
  project_ref: string
  requested_by_gotrue_id: string
  requested_via: 'studio' | 'builder' | 'api'
  status: 'requested' | 'building' | 'ready' | 'failed' | 'archived'
  target_url: string
  updated_at: string
}

export type ProjectDeploymentsData = {
  deployments: ProjectDeployment[]
}

export type ProjectDeploymentsVariables = {
  limit?: number
  projectRef?: string
}

export const projectDeploymentsKeys = {
  list: (projectRef?: string, limit?: number) => ['project-deployments', projectRef, limit] as const,
}

async function getProjectDeployments(
  { limit = 10, projectRef }: ProjectDeploymentsVariables,
  signal?: AbortSignal
): Promise<ProjectDeploymentsData> {
  if (!projectRef) throw new Error('projectRef is required')

  const { data, error } = await get('/platform/projects/{ref}/deployments', {
    params: { path: { ref: projectRef }, query: { limit } },
    signal,
  })

  if (error) handleError(error)

  return data as unknown as ProjectDeploymentsData
}

export const useProjectDeploymentsQuery = <TData = ProjectDeploymentsData>(
  { limit = 10, projectRef }: ProjectDeploymentsVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<ProjectDeploymentsData, ResponseError, TData> = {}
) => {
  return useQuery<ProjectDeploymentsData, ResponseError, TData>({
    queryKey: projectDeploymentsKeys.list(projectRef, limit),
    queryFn: ({ signal }) => getProjectDeployments({ limit, projectRef }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
}
