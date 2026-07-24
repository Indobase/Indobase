import { useQuery } from '@tanstack/react-query'
import { getAccessToken } from 'common'

import type { MerchantProfilePublic } from 'lib/api/saas/merchant-kyc-types'
import type { ResponseError, UseCustomQueryOptions } from 'types'

export type MerchantProfileVariables = {
  projectRef?: string
}

export type MerchantProfileResponse = {
  merchant: MerchantProfilePublic
}

async function getMerchantProfile(
  { projectRef }: MerchantProfileVariables,
  signal?: AbortSignal
): Promise<MerchantProfileResponse> {
  if (!projectRef) throw new Error('projectRef is required')

  const accessToken = await getAccessToken()
  const response = await fetch(`/api/platform/projects/${projectRef}/payments/merchant`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    signal,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || `Failed to load merchant (${response.status})`), {
      code: response.status,
      message: payload?.message || `Failed to load merchant (${response.status})`,
    })
  }

  return payload as MerchantProfileResponse
}

export const merchantProfileKeys = {
  detail: (projectRef?: string) => ['project-payment-merchant', projectRef] as const,
}

export const useMerchantProfileQuery = <TData = MerchantProfileResponse>(
  { projectRef }: MerchantProfileVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<MerchantProfileResponse, ResponseError, TData> = {}
) =>
  useQuery<MerchantProfileResponse, ResponseError, TData>({
    queryKey: merchantProfileKeys.detail(projectRef),
    queryFn: ({ signal }) => getMerchantProfile({ projectRef }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
