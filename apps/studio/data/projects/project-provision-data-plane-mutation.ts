import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { API_URL } from 'lib/constants'
import { fetchPost } from 'data/fetchers'
import { tenantDataPlaneKeys } from 'data/projects/project-tenant-data-plane-query'
import { INFINITE_PROJECTS_KEY_PREFIX, projectKeys } from 'data/projects/keys'
import { ResponseError } from 'types'
import type { UseCustomMutationOptions } from 'types'

export type ProvisionDataPlaneVariables = { ref: string; apply?: boolean }

export async function provisionDataPlane({ ref, apply = true }: ProvisionDataPlaneVariables) {
  const url = `${API_URL}/platform/projects/${encodeURIComponent(ref)}/provision-data-plane`
  const data = await fetchPost(url, { apply })
  if (data instanceof ResponseError) throw data
  return data as Record<string, unknown>
}

export function useProvisionDataPlaneMutation(
  options?: Omit<
    UseCustomMutationOptions<Record<string, unknown>, ResponseError, ProvisionDataPlaneVariables>,
    'mutationFn'
  >
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: provisionDataPlane,
    async onSuccess(_data, variables) {
      await qc.invalidateQueries({ queryKey: tenantDataPlaneKeys.stack(variables.ref) })
      await qc.invalidateQueries({ queryKey: projectKeys.detail(variables.ref) })
      await qc.invalidateQueries({ queryKey: [INFINITE_PROJECTS_KEY_PREFIX] })
      toast.success('Data plane provision request completed')
    },
    async onError(err) {
      if (err instanceof ResponseError) {
        toast.error(err.message || 'Provision failed')
      }
    },
    ...options,
  })
}
