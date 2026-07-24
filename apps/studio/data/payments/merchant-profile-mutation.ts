import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getAccessToken } from 'common'
import { toast } from 'sonner'

import type { MerchantProfilePatch, MerchantProfilePublic } from 'lib/api/saas/merchant-kyc-types'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { merchantProfileKeys } from './merchant-profile-query'

type MerchantMutationResult = { merchant: MerchantProfilePublic }

async function patchMerchant(projectRef: string, patch: MerchantProfilePatch) {
  const accessToken = await getAccessToken()
  const response = await fetch(`/api/platform/projects/${projectRef}/payments/merchant`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ merchant: patch }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || 'Failed to save merchant profile'), {
      code: response.status,
      message: payload?.message || 'Failed to save merchant profile',
    })
  }
  return payload as MerchantMutationResult
}

async function submitMerchant(projectRef: string) {
  const accessToken = await getAccessToken()
  const response = await fetch(`/api/platform/projects/${projectRef}/payments/merchant`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ action: 'submit' }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || 'Failed to submit merchant KYC'), {
      code: response.status,
      message: payload?.message || 'Failed to submit merchant KYC',
    })
  }
  return payload as MerchantMutationResult
}

async function reviewMerchant(
  projectRef: string,
  action: 'verify' | 'reject',
  reason?: string | null
) {
  const accessToken = await getAccessToken()
  const response = await fetch(`/api/platform/projects/${projectRef}/payments/merchant`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || `Failed to ${action} merchant KYC`), {
      code: response.status,
      message: payload?.message || `Failed to ${action} merchant KYC`,
    })
  }
  return payload as MerchantMutationResult
}

export type MerchantProfileUpdateVariables = {
  projectRef: string
  patch: MerchantProfilePatch
}

export const useMerchantProfileUpdateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<MerchantMutationResult, ResponseError, MerchantProfileUpdateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<MerchantMutationResult, ResponseError, MerchantProfileUpdateVariables>({
    mutationFn: ({ projectRef, patch }) => patchMerchant(projectRef, patch),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({
        queryKey: merchantProfileKeys.detail(variables.projectRef),
      })
      await onSuccess?.(data, variables, context)
    },
    async onError(error, variables, context) {
      if (onError === undefined) {
        toast.error(error.message || 'Failed to save merchant profile')
      } else {
        await onError(error, variables, context)
      }
    },
    ...options,
  })
}

export type MerchantProfileSubmitVariables = {
  projectRef: string
}

export const useMerchantProfileSubmitMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<MerchantMutationResult, ResponseError, MerchantProfileSubmitVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<MerchantMutationResult, ResponseError, MerchantProfileSubmitVariables>({
    mutationFn: ({ projectRef }) => submitMerchant(projectRef),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({
        queryKey: merchantProfileKeys.detail(variables.projectRef),
      })
      await onSuccess?.(data, variables, context)
    },
    async onError(error, variables, context) {
      if (onError === undefined) {
        toast.error(error.message || 'Failed to submit merchant KYC')
      } else {
        await onError(error, variables, context)
      }
    },
    ...options,
  })
}

export type MerchantProfileReviewVariables = {
  projectRef: string
  action: 'verify' | 'reject'
  reason?: string | null
}

export const useMerchantProfileReviewMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<MerchantMutationResult, ResponseError, MerchantProfileReviewVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<MerchantMutationResult, ResponseError, MerchantProfileReviewVariables>({
    mutationFn: ({ projectRef, action, reason }) => reviewMerchant(projectRef, action, reason),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({
        queryKey: merchantProfileKeys.detail(variables.projectRef),
      })
      await onSuccess?.(data, variables, context)
    },
    async onError(error, variables, context) {
      if (onError === undefined) {
        toast.error(error.message || `Failed to ${variables.action} merchant KYC`)
      } else {
        await onError(error, variables, context)
      }
    },
    ...options,
  })
}
