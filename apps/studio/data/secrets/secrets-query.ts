import { useQuery } from '@tanstack/react-query'

import type { components } from 'data/api'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { secretsKeys } from './keys'

export type SecretsVariables = {
  projectRef?: string
}

export type ProjectSecret = components['schemas']['SecretResponse']

export async function getSecrets({ projectRef }: SecretsVariables, _signal?: AbortSignal) {
  if (!projectRef) throw new Error('Project ref is required')

  // Indobase does not use Supabase hosted `/v1/projects/.../secrets`; Edge Function
  // secrets come from the deploy environment. Return an empty list for the UI.
  return [] as ProjectSecret[]
}

export type SecretsData = Awaited<ReturnType<typeof getSecrets>>
export type SecretsError = ResponseError

export const useSecretsQuery = <TData = SecretsData>(
  { projectRef }: SecretsVariables,
  { enabled = true, ...options }: UseCustomQueryOptions<SecretsData, SecretsError, TData> = {}
) =>
  useQuery<SecretsData, SecretsError, TData>({
    queryKey: secretsKeys.list(projectRef),
    queryFn: ({ signal }) => getSecrets({ projectRef }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
