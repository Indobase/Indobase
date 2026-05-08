import { useQuery } from '@tanstack/react-query'

import { useIsLoggedIn } from 'common'
import { get, handleError } from 'data/fetchers'
import type { Permission, ResponseError, UseCustomQueryOptions } from 'types'
import { permissionKeys } from './keys'

export type PermissionsResponse = Permission[]

export async function getPermissions(signal?: AbortSignal) {
  const { data, error } = await get('/platform/profile/permissions', { signal })
  if (error) {
    handleError(error, {
      sentryContext: {
        tags: {
          permissionsQuery: true,
        },
        contexts: {
          rawError: error,
        },
      },
    })
  }

  // [Joshen] TODO: Type this properly from the API
  return data as unknown as PermissionsResponse
}

export type PermissionsData = Awaited<ReturnType<typeof getPermissions>>
export type PermissionsError = ResponseError

export const usePermissionsQuery = <TData = PermissionsData>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<PermissionsData, PermissionsError, TData> = {}) => {
  const isLoggedIn = useIsLoggedIn()

  return useQuery<PermissionsData, PermissionsError, TData>({
    queryKey: permissionKeys.list(),
    queryFn: ({ signal }) => getPermissions(signal),
    ...options,
    // Local /platform/profile/permissions handler is implemented for both
    // cloud and self-hosted modes — gate only on `isLoggedIn`.
    enabled: enabled && isLoggedIn,
    staleTime: 5 * 60 * 1000,
  })
}
