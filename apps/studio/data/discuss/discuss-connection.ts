import { PermissionAction } from '@indobaseinc/shared-types/out/constants'
import { useMemo } from 'react'

import { getKeys, useAPIKeysQuery } from 'data/api-keys/api-keys-query'
import { useProjectEndpointQuery } from 'data/config/project-endpoint-query'
import { useProfileQuery } from 'data/profile/profile-query'
import { useAsyncCheckPermissions } from 'hooks/misc/useCheckPermissions'
import type { DiscussClientVariables } from './discuss-client'

/**
 * Everything the Discuss client needs, assembled from the queries Studio already has.
 *
 * Discuss is a Studio surface, not a separate app: there is no handoff, no second login and no
 * bridge. Identity comes from `useProfileQuery` (Studio's own session) and the connection details
 * come from the same hooks the Connect dialog uses.
 */
export function useDiscussConnection({ projectRef }: { projectRef?: string }) {
  const { data: profile, isSuccess: isSuccessProfile } = useProfileQuery()

  const { data: endpointData, isSuccess: isSuccessEndpoint } = useProjectEndpointQuery({
    projectRef,
  })

  const { can: canReadAPIKeys } = useAsyncCheckPermissions(PermissionAction.READ, 'service_api_keys')
  const { data: apiKeys, isSuccess: isSuccessKeys } = useAPIKeysQuery(
    { projectRef, reveal: true },
    { enabled: canReadAPIKeys }
  )

  const apiKey = useMemo(() => {
    if (!canReadAPIKeys) return undefined
    return getKeys(apiKeys).clientPublishableKey?.api_key ?? undefined
  }, [apiKeys, canReadAPIKeys])

  const displayName = useMemo(() => {
    if (!profile) return undefined
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
    return fullName || profile.username || profile.primary_email
  }, [profile])

  const connection: DiscussClientVariables = {
    projectRef,
    endpoint: endpointData?.endpoint,
    apiKey,
    gotrueId: profile?.gotrue_id,
    email: profile?.primary_email,
  }

  return {
    connection,
    displayName,
    /** True once every piece the client needs is present. Gate `enabled` on this. */
    isReady:
      isSuccessProfile &&
      isSuccessEndpoint &&
      (!canReadAPIKeys ? false : isSuccessKeys) &&
      !!connection.projectRef &&
      !!connection.endpoint &&
      !!connection.apiKey &&
      !!connection.gotrueId,
  }
}
