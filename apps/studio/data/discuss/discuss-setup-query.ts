import { literal } from '@indobaseinc/pg-meta/src/pg-format'
import { useQuery } from '@tanstack/react-query'

import { executeSql, type ExecuteSqlError } from 'data/sql/execute-sql-query'
import type { UseCustomQueryOptions } from 'types'
import { useDiscussConnection } from './discuss-connection'
import { discussKeys } from './keys'
import type { DiscussRole } from './discuss.types'

export type DiscussSetupVariables = {
  projectRef?: string
  connectionString?: string | null
  gotrueId?: string
  email?: string
  displayName?: string
  role?: DiscussRole
}

export type DiscussSetup = {
  memberId: string
  /** How many channels the member is actually in after provisioning. Asserted to be > 0. */
  channelCount: number
}

type SetupRow = { member_id: string | null; channel_count: number | null }

/**
 * Provisioning runs through `executeSql`, not through the Discuss PostgREST client, and that is
 * deliberate.
 *
 * `discuss.ensure_project_setup` is SECURITY DEFINER and `revoke all ... from public`, so it is not
 * — and must never be — callable as `authenticated`. It takes `p_project_ref` and `p_gotrue_id` as
 * arguments, so an authenticated caller who could reach it would be able to enrol themselves into
 * any project at any role. The revoke is the security boundary; running it over Studio's
 * project-scoped SQL path (which Studio already authorises per project) keeps that boundary intact.
 *
 * This is the bootstrap exception the schema calls out, and it is the only one. Every read and
 * every write below it goes through the RLS-bound client.
 */
export async function ensureDiscussProjectSetup(
  { projectRef, connectionString, gotrueId, email, displayName, role }: DiscussSetupVariables,
  signal?: AbortSignal
): Promise<DiscussSetup> {
  if (!projectRef) throw new Error('Project ref is required')
  if (!gotrueId) throw new Error('You must be signed in to open Discuss')
  if (!email) throw new Error('A profile email is required to open Discuss')
  if (!displayName) throw new Error('A profile display name is required to open Discuss')
  if (!role) throw new Error('A role is required to open Discuss')

  const sql = `
with setup as (
  select discuss.ensure_project_setup(
    ${literal(projectRef)},
    ${literal(gotrueId)}::uuid,
    ${literal(email)},
    ${literal(displayName)},
    ${literal(role)}
  ) as member_id
)
select
  setup.member_id,
  (
    select count(*)::int
    from discuss.channel_members cm
    where cm.member_id = setup.member_id
  ) as channel_count
from setup;
`.trim()

  const { result } = await executeSql<SetupRow[]>(
    { projectRef, connectionString, sql, queryKey: ['discuss', 'setup'] },
    signal
  )

  const row = result?.[0]

  if (!row?.member_id) {
    throw new Error(
      'Discuss provisioning did not return a member id. The account was not set up for this project.'
    )
  }

  // The schema comments call for the caller to assert the effect, because the Mattermost
  // equivalent failed silently and left users in ZERO channels while the product rendered
  // "Join a team" with no error anywhere. An empty result here is a failure, not an empty state.
  if (!row.channel_count) {
    throw new Error(
      'Discuss provisioning completed but joined you to no channels. This is a provisioning ' +
        'failure, not an empty project — General, Announcements and Activity should exist.'
    )
  }

  return { memberId: row.member_id, channelCount: row.channel_count }
}

export type DiscussSetupData = DiscussSetup
export type DiscussSetupError = ExecuteSqlError

/**
 * Runs on every Discuss open. `ensure_project_setup` is idempotent and also refreshes the cached
 * role projection, so a role change in Studio takes effect here immediately rather than at some
 * later sync.
 *
 * `role` has to be supplied by the caller — Studio owns authorisation, and this layer must not
 * invent one. Use `toDiscussRole()` on the org role name.
 */
export const useDiscussSetupQuery = <TData = DiscussSetupData>(
  { projectRef, connectionString, role }: Pick<DiscussSetupVariables, 'projectRef' | 'connectionString' | 'role'>,
  { enabled = true, ...options }: UseCustomQueryOptions<DiscussSetupData, DiscussSetupError, TData> = {}
) => {
  const { connection, displayName } = useDiscussConnection({ projectRef })

  return useQuery<DiscussSetupData, DiscussSetupError, TData>({
    queryKey: discussKeys.setup(projectRef),
    queryFn: ({ signal }) =>
      ensureDiscussProjectSetup(
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
