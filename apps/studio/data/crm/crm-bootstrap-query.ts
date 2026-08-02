import { useQuery } from '@tanstack/react-query'

import { useOrganizationMembersQuery } from 'data/organizations/organization-members-query'
import { useOrganizationRolesV2Query } from 'data/organization-members/organization-roles-query'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { useProfile } from 'lib/profile'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { getCrmActivities } from './crm-activities-query'
import { getCrmCompanies } from './crm-companies-query'
import { useCrmConnection } from './crm-connection'
import { getCrmContacts } from './crm-contacts-query'
import { getCrmDeals } from './crm-deals-query'
import { getCrmLeads } from './crm-leads-query'
import { ensureCrmProjectSetup } from './crm-setup-query'
import { getCrmStages } from './crm-stages-query'
import { crmKeys } from './keys'
import {
  toCrmRole,
  type CrmActivity,
  type CrmCompany,
  type CrmContact,
  type CrmDeal,
  type CrmLead,
  type CrmRole,
  type CrmStage,
} from './crm.types'

export type CrmBootstrap = {
  memberId: string
  role: CrmRole
  stages: CrmStage[]
  companies: CrmCompany[]
  contacts: CrmContact[]
  deals: CrmDeal[]
  leads: CrmLead[]
  activities: CrmActivity[]
}

export function useCrmCallerRole(projectRef?: string): {
  role: CrmRole | undefined
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

  if (rolesReady && roles) {
    const roleId = me?.role_ids?.[0]
    const allRoles = [...(roles?.org_scoped_roles ?? []), ...(roles?.project_scoped_roles ?? [])]
    const roleName = allRoles.find((role) => role.id === roleId)?.name ?? me?.role
    return { role: toCrmRole(roleName), isReady: true, error: null }
  }

  return { role: toCrmRole(me?.role), isReady: true, error: null }
}

async function ensureCrmInstalled(projectRef: string) {
  const response = await fetch(
    `/api/platform/projects/${encodeURIComponent(projectRef)}/crm/ensure`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }
  )
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? `Failed to install CRM (${response.status})`)
  }
}

export async function bootstrapCrm({
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
  role: CrmRole
  endpoint: string
  apiKey: string
}): Promise<CrmBootstrap> {
  await ensureCrmInstalled(projectRef)

  const setup = await ensureCrmProjectSetup({
    projectRef,
    connectionString,
    gotrueId,
    email,
    displayName,
    role,
  })

  const clientVars = { projectRef, endpoint, apiKey, gotrueId, email }
  const [stages, companies, contacts, deals, leads, activities] = await Promise.all([
    getCrmStages(clientVars),
    getCrmCompanies(clientVars),
    getCrmContacts(clientVars),
    getCrmDeals(clientVars),
    getCrmLeads(clientVars),
    getCrmActivities(clientVars),
  ])

  return {
    memberId: setup.memberId,
    role,
    stages,
    companies,
    contacts,
    deals,
    leads,
    activities,
  }
}

export const useCrmBootstrapQuery = <TData = CrmBootstrap>(
  { projectRef }: { projectRef?: string },
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<CrmBootstrap, ResponseError, TData> = {}
) => {
  const { data: project } = useSelectedProjectQuery()
  const { connection, displayName, isReady: connectionReady } = useCrmConnection({ projectRef })
  const { role, isReady: roleReady, error: roleError } = useCrmCallerRole(projectRef)

  return useQuery({
    queryKey: crmKeys.setup(projectRef),
    queryFn: async () => {
      if (roleError) throw roleError
      if (!projectRef) throw new Error('Project ref is required')
      if (!connection.gotrueId || !connection.email || !displayName || !role) {
        throw new Error('CRM bootstrap is missing identity or role')
      }
      if (!connection.endpoint || !connection.apiKey) {
        throw new Error('CRM bootstrap is missing project API credentials')
      }
      return bootstrapCrm({
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
