import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { API_URL } from 'lib/constants'
import { fetchPost } from 'data/fetchers'
import { INFINITE_PROJECTS_KEY_PREFIX } from 'data/projects/keys'
import { tenantDataPlaneKeys } from 'data/projects/project-tenant-data-plane-query'
import type { UseCustomMutationOptions } from 'types'
import { ResponseError } from 'types'

export type BackfillTenantDbVariables = { ref: string }

export async function backfillTenantDataPlaneDb({ ref }: BackfillTenantDbVariables) {
  const url = `${API_URL}/platform/projects/${encodeURIComponent(ref)}/backfill-tenant-data-plane-db`
  const data = await fetchPost(url, {})
  if (data instanceof ResponseError) throw data
  return data as { ok: boolean; dbName: string; tenantRole: string }
}

export function useBackfillTenantDataPlaneDbMutation(
  options?: Omit<
    UseCustomMutationOptions<
      Awaited<ReturnType<typeof backfillTenantDataPlaneDb>>,
      ResponseError,
      BackfillTenantDbVariables
    >,
    'mutationFn'
  >
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: backfillTenantDataPlaneDb,
    async onSuccess(_data, variables) {
      await qc.invalidateQueries({ queryKey: tenantDataPlaneKeys.stack(variables.ref) })
      await qc.invalidateQueries({ queryKey: [INFINITE_PROJECTS_KEY_PREFIX] })
      toast.success('Tenant database roles and schemas were updated')
    },
    async onError(err) {
      if (err instanceof ResponseError) {
        toast.error(err.message || 'Backfill failed')
      }
    },
    ...options,
  })
}
