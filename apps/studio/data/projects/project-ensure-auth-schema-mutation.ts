import { useMutation, useQueryClient } from '@tanstack/react-query'

import { API_URL } from 'lib/constants'
import type { ResponseError } from 'types'

export type EnsureAuthSchemaVariables = { ref: string }

export type EnsureAuthSchemaResult = {
  ok: true
  alreadyReady: boolean
  provisioned: boolean
}

export async function ensureAuthSchema({ ref }: EnsureAuthSchemaVariables) {
  const res = await fetch(
    `${API_URL}/platform/projects/${encodeURIComponent(ref)}/ensure-auth-schema`,
    { method: 'POST', credentials: 'include' }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(
      typeof body?.message === 'string' ? body.message : 'Failed to initialize Auth schema'
    ) as ResponseError
    err.code = res.status
    throw err
  }
  return body as EnsureAuthSchemaResult
}

export const useEnsureAuthSchemaMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ensureAuthSchema,
    onSuccess: (_data, { ref }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', ref, 'users-infinite'] })
      queryClient.invalidateQueries({ queryKey: ['projects', ref, 'users-count'] })
    },
  })
}
