import { useQuery } from '@tanstack/react-query'

import { fetchGet } from 'data/fetchers'
import { ResponseError, type UseCustomQueryOptions } from 'types'

export type ProjectMobileBuildArtifact = {
  build_id: string
  checksum_sha256: string | null
  download_url: string
  file_name: string
  id: string
  inserted_at: string
  kind: 'android_aab' | 'mapping' | 'manifest' | 'other'
  metadata: Record<string, unknown>
  mime_type: string | null
  size_bytes: number | null
  updated_at: string
}

export type ProjectMobileBuild = {
  artifacts: ProjectMobileBuildArtifact[]
  completed_at: string | null
  framework: 'expo' | 'react_native' | 'flutter' | 'other'
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
  priority: 'standard' | 'priority'
  profile: 'production' | 'preview'
  project_ref: string
  requested_by_gotrue_id: string
  requested_via: 'studio' | 'builder' | 'api'
  status: 'requested' | 'building' | 'ready' | 'failed' | 'archived'
  target: 'android_aab'
  updated_at: string
}

export type ProjectMobileBuildsData = {
  builds: ProjectMobileBuild[]
}

export type ProjectMobileBuildsVariables = {
  limit?: number
  projectRef?: string
}

export const projectMobileBuildsKeys = {
  list: (projectRef?: string, limit?: number) => ['project-mobile-builds', projectRef, limit] as const,
}

async function getProjectMobileBuilds(
  { limit = 10, projectRef }: ProjectMobileBuildsVariables
): Promise<ProjectMobileBuildsData> {
  if (!projectRef) throw new Error('projectRef is required')

  const response = await fetchGet<ProjectMobileBuildsData>(
    `/api/platform/projects/${encodeURIComponent(projectRef)}/mobile-builds?limit=${limit}`
  )

  if (response instanceof ResponseError) {
    throw response
  }

  return response
}

export const useProjectMobileBuildsQuery = <TData = ProjectMobileBuildsData>(
  { limit = 10, projectRef }: ProjectMobileBuildsVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<ProjectMobileBuildsData, ResponseError, TData> = {}
) => {
  return useQuery<ProjectMobileBuildsData, ResponseError, TData>({
    queryKey: projectMobileBuildsKeys.list(projectRef, limit),
    queryFn: () => getProjectMobileBuilds({ limit, projectRef }),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
}
