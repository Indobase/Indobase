/**
 * OS-native workspace — lightweight saas.projects row without data-plane provision.
 */
import { makeRandomString } from 'lib/helpers'
import { PROJECT_REST_URL } from 'lib/constants/api'

import { executeQuery } from './query'
import {
  createOrganization,
  getGotrueUserId,
  getPrimaryEmail,
  listOrganizations,
  listProjects,
  type Claims,
} from './platform'

export const OS_NATIVE_STATUS = 'OS_NATIVE' as const
export const OS_NATIVE_DATA_PLANE_MODE = 'os_native' as const

export type OsWorkspaceRecord = {
  ref: string
  name: string
  organization_slug: string
  organization_id: number
  status: string
  data_plane_mode: string
  provision_state: 'none' | 'provisioning' | 'ready'
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function uniqueProjectRef(base: string) {
  const clean = slugify(base).replace(/-/g, '')
  const suffix = makeRandomString(10).toLowerCase()
  return `${clean || 'workspace'}-${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

function defaultWorkspaceName(displayName: string): string {
  const base = displayName.trim() || 'My business'
  const label = base.endsWith(' workspace') ? base : `${base} workspace`
  return label.slice(0, 64)
}

function parseProvisionState(
  authConfig: unknown,
  status: string,
  dataPlaneMode: string,
): OsWorkspaceRecord['provision_state'] {
  if (dataPlaneMode === OS_NATIVE_DATA_PLANE_MODE && status === OS_NATIVE_STATUS) {
    return 'none'
  }
  if (status === 'PROVISIONING') return 'provisioning'
  if (status === 'ACTIVE_HEALTHY' || status === 'RESTARTING') return 'ready'
  const cfg =
    authConfig && typeof authConfig === 'object'
      ? (authConfig as { provision_state?: string })
      : null
  if (cfg?.provision_state === 'none') return 'none'
  return 'none'
}

function rowToWorkspace(row: {
  ref: string
  name: string
  organization_slug: string
  organization_id: number
  status: string
  data_plane_mode: string
  auth_config: unknown
}): OsWorkspaceRecord {
  return {
    ref: row.ref,
    name: row.name,
    organization_slug: row.organization_slug,
    organization_id: row.organization_id,
    status: row.status,
    data_plane_mode: row.data_plane_mode,
    provision_state: parseProvisionState(row.auth_config, row.status, row.data_plane_mode),
  }
}

export async function getOsWorkspace({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<OsWorkspaceRecord | null> {
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    ref: string
    name: string
    organization_slug: string
    organization_id: number
    status: string
    data_plane_mode: string
    auth_config: unknown
  }>({
    query: `
      select p.ref, p.name, p.organization_slug, p.organization_id, p.status,
             p.data_plane_mode, p.auth_config
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2 and p.is_branch = false
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  if (!row) return null
  return rowToWorkspace(row)
}

async function findExistingOsWorkspace(claims: Claims): Promise<OsWorkspaceRecord | null> {
  const { projects } = await listProjects({ claims, limit: 20 })
  for (const p of projects) {
    const full = await getOsWorkspace({ claims, ref: p.ref })
    if (full) return full
  }
  return null
}

/**
 * Ensure an OS workspace exists for the user — no provisioner, no tenant stack.
 */
export async function createOsWorkspace({
  claims,
  displayName,
}: {
  claims: Claims
  displayName: string
}): Promise<OsWorkspaceRecord> {
  const gotrueId = getGotrueUserId(claims)
  const existing = await findExistingOsWorkspace(claims)
  if (existing) return existing

  const orgs = await listOrganizations({ claims, limit: 5 })
  let orgSlug = orgs[0]?.slug
  let orgId = orgs[0]?.id

  if (!orgSlug || !orgId) {
    const email = getPrimaryEmail(claims) || 'user@indobase.in'
    const created = await createOrganization({
      claims,
      body: {
        name: displayName,
        kind: 'PERSONAL',
        tier: 'free',
      },
    })
    orgSlug = created.slug
    orgId = created.id
  }

  const ref = uniqueProjectRef(displayName)
  const name = defaultWorkspaceName(displayName)

  const inserted = await executeQuery<{
    ref: string
    name: string
    organization_slug: string
    organization_id: number
    status: string
    data_plane_mode: string
    auth_config: unknown
  }>({
    query: `
      insert into saas.projects (
        organization_id,
        organization_slug,
        ref,
        name,
        cloud_provider,
        region,
        status,
        service_key,
        anon_key,
        subscription_id,
        rest_url,
        db_host,
        data_plane_mode,
        auth_config
      ) values (
        $1, $2, $3, $4, 'localhost', 'local', $5,
        '', '', '', $6, '127.0.0.1', $7, $8::jsonb
      )
      returning ref, name, organization_slug, organization_id, status, data_plane_mode, auth_config
    `,
    parameters: [
      orgId,
      orgSlug,
      ref,
      name,
      OS_NATIVE_STATUS,
      PROJECT_REST_URL,
      OS_NATIVE_DATA_PLANE_MODE,
      JSON.stringify({ os_native: true, provision_state: 'none' }),
    ],
    actorId: gotrueId,
  })

  if (inserted.error || !inserted.data?.[0]) {
    throw inserted.error ?? new Error('Failed to create OS workspace')
  }

  return rowToWorkspace(inserted.data[0])
}
