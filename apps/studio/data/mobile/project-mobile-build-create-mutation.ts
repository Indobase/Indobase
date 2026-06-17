import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { fetchPost } from 'data/fetchers'
import { ResponseError, type UseCustomMutationOptions } from 'types'

import {
  type ProjectMobileBuild,
  projectMobileBuildsKeys,
} from './project-mobile-builds-query'

export type CreateProjectMobileBuildVariables = {
  framework?: 'expo' | 'react_native' | 'flutter' | 'other'
  metadata?: Record<string, unknown>
  profile?: 'production' | 'preview'
  projectRef: string
  requested_via?: 'studio' | 'builder' | 'api'
  target?: 'android_aab'
}

async function createProjectMobileBuild({
  framework = 'expo',
  metadata,
  profile = 'production',
  projectRef,
  requested_via = 'studio',
  target = 'android_aab',
}: CreateProjectMobileBuildVariables): Promise<ProjectMobileBuild> {
  const response = await fetchPost<ProjectMobileBuild>(
    `/api/platform/projects/${encodeURIComponent(projectRef)}/mobile-builds`,
    {
      framework,
      metadata,
      profile,
      requested_via,
      target,
    }
  )

  if (response instanceof ResponseError) {
    throw response
  }

  return response
}

export function useCreateProjectMobileBuildMutation(
  options?: Omit<
    UseCustomMutationOptions<ProjectMobileBuild, ResponseError, CreateProjectMobileBuildVariables>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createProjectMobileBuild,
    async onSuccess(_data, variables) {
      await queryClient.invalidateQueries({
        queryKey: projectMobileBuildsKeys.list(variables.projectRef),
      })
      toast.success('Android bundle build requested')
    },
    async onError(error) {
      if (error instanceof ResponseError) {
        toast.error(error.message || 'Failed to create Android bundle build')
      }
    },
    ...options,
  })
}
