import { literal } from '@indobaseinc/pg-meta/src/pg-format'
import { useQuery } from '@tanstack/react-query'

import { executeSql, type ExecuteSqlError } from 'data/sql/execute-sql-query'
import type { UseCustomQueryOptions } from 'types'
import { useCrmConnection } from './crm-connection'
import { crmKeys } from './keys'
import type { CrmRole } from './crm.types'

export type CrmSetupVariables = {
  projectRef?: string
  connectionString?: string | null
  gotrueId?: string
  email?: string
  displayName?: string
  role?: CrmRole
}

export type CrmSetup = {
  memberId: string
}

type SetupRow = { member_id: string | null }

/**
 * Provisioning runs through `executeSql`, not through the CRM PostgREST client, and that is
 * deliberate.
 *
 * `crm.ensure_project_setup` is SECURITY DEFINER and `revoke all ... from public`, so it is not —
 * and must never be — callable as `authenticated`. It takes `p_project_ref` and `p_gotrue_id` as
 * arguments, so an authenticated caller who could reach it would be able to enrol themselves into
 * any project at any role. The revoke is the security boundary; running it over Studio's
 * project-scoped SQL path (which Studio already authorises per project) keeps that boundary
 * intact. This is the same bootstrap exception `discuss.ensure_project_setup` uses.
 */
export async function ensureCrmProjectSetup(
  { projectRef, connectionString, gotrueId, email, displayName, role }: CrmSetupVariables,
  signal?: AbortSignal
): Promise<CrmSetup> {
  if (!projectRef) throw new Error('Project ref is required')
  if (!gotrueId) throw new Error('You must be signed in to open CRM')
  if (!email) throw new Error('A profile email is required to open CRM')
  if (!displayName) throw new Error('A profile display name is required to open CRM')
  if (!role) throw new Error('A role is required to open CRM')

  const sql = `
select crm.ensure_project_setup(
  ${literal(projectRef)},
  ${literal(gotrueId)}::uuid,
  ${literal(email)},
  ${literal(displayName)},
  ${literal(role)}
) as member_id;
`.trim()

  const { result } = await executeSql<SetupRow[]>(
    { projectRef, connectionString, sql, queryKey: ['crm', 'setup'] },
    signal
  )

  const row = result?.[0]

  if (!row?.member_id) {
    throw new Error(
      'CRM provisioning did not return a member id. The account was not set up for this project.'
    )
  }

  return { memberId: row.member_id }
}

export type CrmSetupData = CrmSetup
export type CrmSetupError = ExecuteSqlError

/**
 * Runs on every CRM open. `ensure_project_setup` is idempotent and also refreshes the cached role
 * projection, so a role change in Studio takes effect here immediately rather than at some later
 * sync.
 *
 * `role` has to be supplied by the caller — Studio owns authorisation, and this layer must not
 * invent one. Use `toCrmRole()` on the org role name.
 */
export const useCrmSetupQuery = <TData = CrmSetupData>(
  { projectRef, connectionString, role }: Pick<CrmSetupVariables, 'projectRef' | 'connectionString' | 'role'>,
  { enabled = true, ...options }: UseCustomQueryOptions<CrmSetupData, CrmSetupError, TData> = {}
) => {
  const { connection, displayName } = useCrmConnection({ projectRef })

  return useQuery<CrmSetupData, CrmSetupError, TData>({
    queryKey: crmKeys.setup(projectRef),
    queryFn: ({ signal }) =>
      ensureCrmProjectSetup(
        {
          projectRef,
          connectionString,
          gotrueId: connection.gotrueId,
          email: connection.email,
          displayName,
          role,
        },
        signal
      ),
    enabled:
      enabled &&
      typeof projectRef !== 'undefined' &&
      !!connection.gotrueId &&
      !!connection.email &&
      !!displayName &&
      !!role,
    // Idempotent, but not free. Re-running it on every window focus would hammer the tenant DB.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    ...options,
  })
}
