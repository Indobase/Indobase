import { useQuery } from '@tanstack/react-query'

import type { components } from 'data/api'
import { get, handleError } from 'data/fetchers'
import { IS_PLATFORM } from 'lib/constants'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { secretsKeys } from './keys'

export type SecretsVariables = {
  projectRef?: string
}

export type ProjectSecret = components['schemas']['SecretResponse']

export async function getSecrets({ projectRef }: SecretsVariables, signal?: AbortSignal) {
  if (!projectRef) throw new Error('Project ref is required')

  // Self-hosted (incl. Indobase SaaS) doesn't expose a project-secrets API
  // (Edge Functions read secrets from the deploy environment instead). Return
  // an empty list so the UI degrades to "no secrets" instead of crashing.
  if (!IS_PLATFORM) return [] as ProjectSecret[]

  const { data, error } = await get(`/v1/projects/{ref}/secrets`, {
    params: { path: { ref: projectRef } },
    signal,
  })

  if (error) handleError(error)
  return data
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
