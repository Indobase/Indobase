import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { get, handleError, post } from 'data/fetchers'
import { API_URL } from 'lib/constants'
import type { DataPrincipalRequestType } from 'common'
import type { ResponseError, UseCustomMutationOptions } from 'types'

export type DataPrincipalRequestRow = {
  id: number
  request_type: string
  status: string
  message: string | null
  created_at: string
  resolved_at: string | null
}

const dataRequestsKeys = {
  list: ['platform', 'profile', 'data-requests'] as const,
}

export function useDataPrincipalRequestsQuery() {
  return useQuery({
    queryKey: dataRequestsKeys.list,
    queryFn: async () => {
      const { data, error } = await get('/platform/profile/data-requests')
      if (error) handleError(error)
      return (data as { data: DataPrincipalRequestRow[] }).data ?? []
    },
  })
}

export async function createDataPrincipalRequest({
  request_type,
  message,
}: {
  request_type: DataPrincipalRequestType
  message?: string
}) {
  const { data, error } = await post('/platform/profile/data-requests', {
    // @ts-ignore
    body: { request_type, message },
  })
  if (error) handleError(error)
  return data as { data: DataPrincipalRequestRow }
}

export function useCreateDataPrincipalRequestMutation(
  options: Omit<
    UseCustomMutationOptions<
      { data: DataPrincipalRequestRow },
      ResponseError,
      { request_type: DataPrincipalRequestType; message?: string }
    >,
    'mutationFn'
  > = {}
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createDataPrincipalRequest,
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: dataRequestsKeys.list })
      await options.onSuccess?.(...args)
    },
    ...options,
  })
}

export async function downloadPersonalDataExport() {
  const response = await fetch(`${API_URL}/platform/profile/data-export`, {
    credentials: 'include',
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Failed to export personal data')
  }
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match?.[1] ?? `indobase-personal-data.json`
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function usePersonalDataExportMutation(
  options: Omit<UseCustomMutationOptions<void, Error, void>, 'mutationFn'> = {}
) {
  return useMutation({
    mutationFn: downloadPersonalDataExport,
    ...options,
  })
}
