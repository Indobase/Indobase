import { useQuery } from '@tanstack/react-query'

import { get, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'

import { saasOrgKeys } from './organization-memberships-query'

export type SaasOrganizationInvite = {
  id: number
  invited_at: string
  invited_email: string
  role_id: number
}

export async function getSaasOrganizationInvites({ slug }: { slug?: string }, signal?: AbortSignal) {
  if (!slug) throw new Error('slug is required')
  const { data, error } = await get('/platform/organizations/{slug}/members/invitations', {
    params: { path: { slug } },
    signal,
  })
  if (error) handleError(error)
  return (data as any)?.invitations as SaasOrganizationInvite[]
}

export const useSaasOrganizationInvitesQuery = <TData = SaasOrganizationInvite[]>(
  { slug }: { slug?: string },
  { enabled = true, ...options }: UseCustomQueryOptions<SaasOrganizationInvite[], ResponseError, TData> = {}
) =>
  useQuery<SaasOrganizationInvite[], ResponseError, TData>({
    queryKey: saasOrgKeys.invites(slug),
    queryFn: ({ signal }) => getSaasOrganizationInvites({ slug }, signal),
    enabled: enabled && typeof slug !== 'undefined',
    ...options,
  })
