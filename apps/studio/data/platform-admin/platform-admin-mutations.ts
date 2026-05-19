import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { fetchPatch } from 'data/fetchers'
import { API_URL } from 'lib/constants'
import type {
  PlatformAdminOrganizationDetail,
  PlatformOrgAdminPatchInput,
} from 'lib/api/saas/platform-admin'
import { ResponseError, type UseCustomMutationOptions } from 'types'

import { platformAdminKeys } from './keys'

async function adminPatchJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_URL}/platform/admin${path}`
  const data = await fetchPatch<T>(url, body as Record<string, unknown>)
  if (data instanceof ResponseError) throw data
  return data as T
}

export async function patchPlatformAdminOrganization(
  slug: string,
  patch: PlatformOrgAdminPatchInput
): Promise<PlatformAdminOrganizationDetail> {
  return adminPatchJson<PlatformAdminOrganizationDetail>(
    `/organizations/${encodeURIComponent(slug)}`,
    patch
  )
}

export async function patchPlatformAdminUserBan(
  gotrueId: string,
  banned: boolean
): Promise<{ ok: boolean }> {
  const url = `${API_URL}/platform/admin/users`
  return adminPatchJson<{ ok: boolean }>(url, { gotrue_id: gotrueId, banned })
}

function invalidatePlatformAdminQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'overview'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'organizations'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'organization'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'users'] }),
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'audit-logs'] }),
  ])
}

export const usePlatformAdminOrganizationPatchMutation = (
  options: Omit<
    UseCustomMutationOptions<
      PlatformAdminOrganizationDetail,
      ResponseError,
      { slug: string; patch: PlatformOrgAdminPatchInput }
    >,
    'mutationFn'
  > = {}
) => {
  const queryClient = useQueryClient()
  const { onSuccess, onError, ...rest } = options

  return useMutation({
    mutationFn: ({ slug, patch }) => patchPlatformAdminOrganization(slug, patch),
    async onSuccess(data, variables, context) {
      await invalidatePlatformAdminQueries(queryClient)
      queryClient.setQueryData(platformAdminKeys.organization(variables.slug), data)
      toast.success('Organization updated')
      await onSuccess?.(data, variables, context)
    },
    async onError(err, variables, context) {
      if (onError === undefined) {
        toast.error(`Update failed: ${err.message}`)
      } else {
        onError(err, variables, context)
      }
    },
    ...rest,
  })
}

export const usePlatformAdminUserBanMutation = (
  options: Omit<
    UseCustomMutationOptions<{ ok: boolean }, ResponseError, { gotrueId: string; banned: boolean }>,
    'mutationFn'
  > = {}
) => {
  const queryClient = useQueryClient()
  const { onSuccess, onError, ...rest } = options

  return useMutation({
    mutationFn: ({ gotrueId, banned }) => patchPlatformAdminUserBan(gotrueId, banned),
    async onSuccess(data, variables, context) {
      await invalidatePlatformAdminQueries(queryClient)
      toast.success(variables.banned ? 'User suspended (GoTrue ban)' : 'User unsuspended')
      await onSuccess?.(data, variables, context)
    },
    async onError(err, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed: ${err.message}`)
      } else {
        onError(err, variables, context)
      }
    },
    ...rest,
  })
}
