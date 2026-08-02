import { useQuery } from '@tanstack/react-query'

import { useOrganizationMembersQuery } from 'data/organizations/organization-members-query'
import { useOrganizationRolesV2Query } from 'data/organization-members/organization-roles-query'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { useProfile } from 'lib/profile'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { getDiscussChannels } from './discuss-channels-query'
import { useDiscussConnection } from './discuss-connection'
import { getDiscussMembers } from './discuss-members-query'
import { ensureDiscussProjectSetup } from './discuss-setup-query'
import { discussKeys } from './keys'
import {
  toDiscussRole,
  type DiscussChannelWithUnread,
  type DiscussMember,
  type DiscussRole,
} from './discuss.types'

export type DiscussBootstrap = {
  member: DiscussMember
  channels: DiscussChannelWithUnread[]
  members: DiscussMember[]
  role: DiscussRole
}

/**
 * Resolve the caller's Studio org role for this project, mapped into Discuss's vocabulary.
 * Falls back to `viewer` so an unknown role can never grant write by accident.
 */
export function useDiscussCallerRole(projectRef?: string): {
  role: DiscussRole | undefined
  isReady: boolean
  error: Error | null
} {
  const { profile } = useProfile()
  const { data: organization } = useSelectedOrganizationQuery()
  const { data: members, error: membersError, isSuccess: membersReady } = useOrganizationMembersQuery({
    slug: organization?.slug,
  })
  const { data: roles, isSuccess: rolesReady } = useOrganizationRolesV2Query({
    slug: organization?.slug,
  })

  if (!projectRef || !profile?.gotrue_id) {
    return { role: undefined, isReady: false, error: null }
  }

  if (membersError) {
    return { role: undefined, isReady: false, error: membersError as Error }
  }

  if (!membersReady) {
    return { role: undefined, isReady: false, error: null }
  }

  const me = members?.find((member) => member.gotrue_id === profile.gotrue_id) as
    | { gotrue_id?: string; role_ids?: number[]; role?: string }
    | undefined

  // Prefer roles catalog when available; otherwise use the role string from /members.
  if (rolesReady && roles) {
    const roleId = me?.role_ids?.[0]
    const allRoles = [
      ...(roles?.org_scoped_roles ?? []),
      ...(roles?.project_scoped_roles ?? []),
    ]
    const roleName = allRoles.find((role) => role.id === roleId)?.name ?? me?.role
    return { role: toDiscussRole(roleName), isReady: true, error: null }
  }

  return { role: toDiscussRole(me?.role), isReady: true, error: null }
}

async function ensureDiscussInstalled(projectRef: string) {
  const { getAccessToken } = await import('common')
  const accessToken = await getAccessToken()
  const response = await fetch(
    `/api/platform/projects/${encodeURIComponent(projectRef)}/discuss/ensure`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    }
  )
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? `Failed to install Discuss (${response.status})`)
  }
}

export async function bootstrapDiscuss({
  projectRef,
  connectionString,
  gotrueId,
  email,
  displayName,
  role,
  endpoint,
  apiKey,
}: {
  projectRef: string
  connectionString?: string | null
  gotrueId: string
  email: string
  displayName: string
  role: DiscussRole
  endpoint: string
  apiKey: string
}): Promise<DiscussBootstrap> {
  await ensureDiscussInstalled(projectRef)

  const setup = await ensureDiscussProjectSetup({
    projectRef,
    connectionString,
    gotrueId,
    email,
    displayName,
    role,
  })

  const clientVars = { projectRef, endpoint, apiKey, gotrueId, email }
  const [channels, members] = await Promise.all([
    getDiscussChannels(clientVars),
    getDiscussMembers(clientVars),
  ])

  const member = members.find((row) => row.id === setup.memberId)
  if (!member) {
    throw new Error(
      'Discuss provisioning completed but your member row was not readable. Check RLS and try again.'
    )
  }

  return { member, channels, members, role }
}

export type DiscussBootstrapData = DiscussBootstrap
export type DiscussBootstrapError = ResponseError

/**
 * First paint for `/project/[ref]/discuss`: install schema if needed, provision channels, then
 * load the sidebar. Everything below this point is RLS-bound PostgREST.
 */
export const useDiscussBootstrapQuery = <TData = DiscussBootstrapData>(
  { projectRef }: { projectRef?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<DiscussBootstrapData, DiscussBootstrapError, TData> = {}
) => {
  const { data: project } = useSelectedProjectQuery()
  const { connection, displayName, isReady: connectionReady } = useDiscussConnection({ projectRef })
  const { role, isReady: roleReady, error: roleError } = useDiscussCallerRole(projectRef)

  return useQuery<DiscussBootstrapData, DiscussBootstrapError, TData>({
    queryKey: discussKeys.setup(projectRef),
    queryFn: async () => {
      if (roleError) throw roleError
      if (!projectRef) throw new Error('Project ref is required')
      if (!connection.gotrueId || !connection.email || !displayName || !role) {
        throw new Error('Discuss bootstrap is missing identity or role')
      }
      if (!connection.endpoint || !connection.apiKey) {
        throw new Error('Discuss bootstrap is missing project API credentials')
      }

      return bootstrapDiscuss({
        projectRef,
        connectionString: project?.connectionString,
        gotrueId: connection.gotrueId,
        email: connection.email,
        displayName,
        role,
        endpoint: connection.endpoint,
        apiKey: connection.apiKey,
      })
    },
    enabled:
      enabled &&
      typeof projectRef !== 'undefined' &&
      connectionReady &&
      roleReady &&
      !!role &&
      !!displayName,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    ...options,
  })
}
