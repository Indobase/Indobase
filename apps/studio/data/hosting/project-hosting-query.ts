import { useQuery } from '@tanstack/react-query'

import { get, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'

export type ProjectHostingVariables = {
  projectRef?: string
}

export type ProjectHostingData = {
  project: {
    name: string
    organization_slug: string
    ref: string
  }
  hosting: {
    active_url: string
    api_url: string
    custom_domain: {
      configured: boolean
      hostname: string | null
      status: string
      url: string | null
      verification_errors: string[]
    }
    default_url: string
    manage_url: string
    mode: 'managed_subdomain'
    settings_url: string
    uses_dedicated_subdomain: boolean
  }
  studio: {
    general_settings_url: string
    hosting_url: string
    origin: string
    project_url: string
  }
}

async function getProjectHosting(
  { projectRef }: ProjectHostingVariables,
  signal?: AbortSignal
): Promise<ProjectHostingData> {
  if (!projectRef) throw new Error('projectRef is required')

  const { data, error } = await get('/platform/projects/{ref}/hosting', {
    params: { path: { ref: projectRef } },
    signal,
  })

  if (error) handleError(error)

  return data as unknown as ProjectHostingData
}

export const useProjectHostingQuery = <TData = ProjectHostingData>(
  { projectRef }: ProjectHostingVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<ProjectHostingData, ResponseError, TData> = {}
) => {
  return useQuery<ProjectHostingData, ResponseError, TData>({
    queryKey: ['project-hosting', projectRef],
    queryFn: ({ signal }) => getProjectHosting({ projectRef }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
}
