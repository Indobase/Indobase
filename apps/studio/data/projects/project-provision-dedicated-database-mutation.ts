import { useMutation, useQueryClient } from '@tanstack/react-query'

import { projectKeys } from 'data/projects/keys'
import { API_URL } from 'lib/constants'
import type { ResponseError } from 'types'

export type ProvisionDedicatedDatabaseVariables = { ref: string }

export type ProvisionDedicatedDatabaseResult = {
  ok: true
  alreadyProvisioned: boolean
}

export async function provisionDedicatedDatabase({ ref }: ProvisionDedicatedDatabaseVariables) {
  const res = await fetch(
    `${API_URL}/platform/projects/${encodeURIComponent(ref)}/provision-dedicated-database`,
    { method: 'POST', credentials: 'include' }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(
      typeof body?.message === 'string'
        ? body.message
        : 'Failed to provision a dedicated project database'
    ) as ResponseError
    err.code = res.status
    throw err
  }
  return body as ProvisionDedicatedDatabaseResult
}

export const useProvisionDedicatedDatabaseMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: provisionDedicatedDatabase,
    onSuccess: (_data, { ref }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(ref) })
      queryClient.invalidateQueries({ queryKey: ['projects', ref, 'users-infinite'] })
      queryClient.invalidateQueries({ queryKey: ['projects', ref, 'users-count'] })
    },
  })
}
