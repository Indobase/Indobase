import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError, post } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'

import { saasOrgKeys } from './organization-memberships-query'

export type CreateSaasInviteVariables = {
  slug: string
  email: string
  role: 'admin' | 'developer' | 'viewer'
}

export async function createSaasInvite({ slug, email, role }: CreateSaasInviteVariables) {
  const { data, error } = await post('/platform/organizations/{slug}/invites', {
    params: { path: { slug } },
    body: { email, role },
  })
  if (error) handleError(error)
  return data
}

type CreateSaasInviteData = Awaited<ReturnType<typeof createSaasInvite>>

export const useCreateSaasInviteMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<CreateSaasInviteData, ResponseError, CreateSaasInviteVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<CreateSaasInviteData, ResponseError, CreateSaasInviteVariables>({
    mutationFn: (vars) => createSaasInvite(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: saasOrgKeys.invites(variables.slug) })
      await onSuccess?.(data, variables, context)
    },
    async onError(err, variables, context) {
      if (onError) return onError(err, variables, context)
      toast.error(`Failed to create invite: ${err.message}`)
    },
    ...options,
  })
}

