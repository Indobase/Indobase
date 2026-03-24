import { useQuery } from '@tanstack/react-query'
import { IS_SAAS } from 'lib/constants'

import { get, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { apiKeysKeys } from './keys'

type LegacyKeys = {
  api_key: string
  description?: string | null
  hash?: string | null
  id?: string | null
  inserted_at?: string | null
  name: string
  prefix?: string | null
  secret_jwt_template?: { role: string } | null
  type: 'legacy' | null
  updated_at?: string | null
}

type SecretKeys = {
  api_key: string
  description?: string
  hash: string
  id: string
  inserted_at: string
  name: string
  prefix: string
  secret_jwt_template: { role: string }
  type: 'secret'
  updated_at?: string
}

type PublishableKeys = {
  api_key: string
  description?: string
  hash?: string
  id: string
  inserted_at: string
  name: string
  prefix?: string
  secret_jwt_template?: { role: string } | null
  type: 'publishable'
  updated_at?: string
}

interface APIKeysVariables {
  projectRef?: string
  reveal?: boolean
}

type APIKey = LegacyKeys | SecretKeys | PublishableKeys

async function getAPIKeys({ projectRef, reveal }: APIKeysVariables, signal?: AbortSignal) {
  if (!projectRef) throw new Error('projectRef is required')

  // Self-hosted setups often don't expose the platform /v1 api-keys endpoint.
  // Build a compatible legacy payload from local project settings + anon key
  // so API key dependent UIs do not get stuck in loading/error loops.
  if (!IS_SAAS) {
    const { data: settings, error: settingsError } = await get('/platform/projects/{ref}/settings', {
      params: { path: { ref: projectRef } },
      signal,
    })
    if (settingsError) handleError(settingsError)

    const anonKey = process.env.NEXT_PUBLIC_ANON_KEY ?? ''
    const serviceKey = (settings as any)?.api_key ?? ''

    const legacyKeys: APIKey[] = [
      {
        name: 'anon',
        api_key: anonKey,
        type: null,
      },
      {
        name: 'service_role',
        api_key: serviceKey,
        type: null,
      },
    ].filter((k) => Boolean(k.api_key))

    return legacyKeys
  }

  const { data, error } = await get(`/v1/projects/{ref}/api-keys`, {
    params: { path: { ref: projectRef }, query: { reveal } },
    signal,
  })

  if (error) handleError(error)

  // [Jonny]: Overriding the types here since some stuff is not actually nullable or optional
  return data as unknown as APIKey[]
}

export type APIKeysData = Awaited<ReturnType<typeof getAPIKeys>>

export const useAPIKeysQuery = <TData = APIKeysData>(
  { projectRef, reveal = false }: APIKeysVariables,
  { enabled = true, ...options }: UseCustomQueryOptions<APIKeysData, ResponseError, TData> = {}
) => {
  return useQuery<APIKeysData, ResponseError, TData>({
    queryKey: apiKeysKeys.list(projectRef, reveal),
    queryFn: ({ signal }) => getAPIKeys({ projectRef, reveal }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
}

export const getKeys = (apiKeys: APIKey[] = []) => {
  const anonKey = apiKeys.find((x) => x.name === 'anon')
  const serviceKey = apiKeys.find((x) => x.name === 'service_role')

  // [Joshen] For now I just want 1 of each, I don't need all
  const publishableKey = apiKeys.find((x) => x.type === 'publishable')
  const secretKey = apiKeys.find((x) => x.type === 'secret')

  const allSecretKeys = apiKeys.filter((x) => x.type === 'secret')

  return { anonKey, serviceKey, publishableKey, secretKey, allSecretKeys }
}
