import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { post } from 'data/fetchers'
import { ResponseError } from 'types'
import type { UseCustomMutationOptions } from 'types'
import {
  type ProjectDeployment,
  projectDeploymentsKeys,
} from './project-deployments-query'

export type CreateProjectDeploymentVariables = {
  metadata?: Record<string, unknown>
  projectRef: string
  requested_via?: 'studio' | 'builder' | 'api'
}

async function createProjectDeployment({
  metadata,
  projectRef,
  requested_via = 'studio',
}: CreateProjectDeploymentVariables): Promise<ProjectDeployment> {
  const { data, error } = await post('/platform/projects/{ref}/deployments', {
    params: { path: { ref: projectRef } },
    body: {
      metadata,
      requested_via,
    },
  })

  if (error) throw error

  return data as unknown as ProjectDeployment
}

export function useCreateProjectDeploymentMutation(
  options?: Omit<
    UseCustomMutationOptions<ProjectDeployment, ResponseError, CreateProjectDeploymentVariables>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createProjectDeployment,
    async onSuccess(_data, variables) {
      await queryClient.invalidateQueries({
        queryKey: projectDeploymentsKeys.list(variables.projectRef),
      })
      toast.success('Deployment request created')
    },
    async onError(error) {
      if (error instanceof ResponseError) {
        toast.error(error.message || 'Failed to create deployment request')
      }
    },
    ...options,
  })
}
