import { useQuery } from '@tanstack/react-query'

import { get, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'

export type SaasOrganizationMembership = {
  gotrue_id: string
  role: 'owner' | 'admin' | 'developer' | 'viewer'
  inserted_at: string
}

export const saasOrgKeys = {
  members: (slug: string | undefined) => ['saas', 'org', slug, 'members'] as const,
  invites: (slug: string | undefined) => ['saas', 'org', slug, 'invites'] as const,
}

export async function getSaasOrganizationMembers(
  { slug }: { slug?: string },
  signal?: AbortSignal
) {
  if (!slug) throw new Error('slug is required')
  const { data, error } = await get('/platform/organizations/{slug}/members', {
    params: { path: { slug } },
    signal,
  })
  if (error) handleError(error)
  return (data as any)?.members as SaasOrganizationMembership[]
}

export const useSaasOrganizationMembersQuery = <TData = SaasOrganizationMembership[]>(
  { slug }: { slug?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<SaasOrganizationMembership[], ResponseError, TData> = {}
) =>
  useQuery<SaasOrganizationMembership[], ResponseError, TData>({
    queryKey: saasOrgKeys.members(slug),
    queryFn: ({ signal }) => getSaasOrganizationMembers({ slug }, signal),
    enabled: enabled && typeof slug !== 'undefined',
    ...options,
  })

