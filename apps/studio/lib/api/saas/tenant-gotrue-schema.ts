import { Client } from 'pg'
import type { JwtPayload } from 'indobase-js'

import { executeQuery } from './query'
import {
  grantTenantAuxDatabasePrivileges,
  grantTenantPostgresAuthReferences,
  grantTenantRoleAuthRead,
  syncTenantAuxRolePasswords,
} from './provision-tenant-db'
import { decryptString } from './util'
import {
  ensureDataPlaneProvisionedIfMissing,
  isDataPlaneProvisionerConfigured,
  provisionTenantDataPlaneStack,
} from './tenant-data-plane-provision'

type Claims = JwtPayload & Record<string, unknown>

function claimsFromActorId(actorId: string): Claims {
  return { sub: actorId } as Claims
}

export async function tenantAuthUsersTableExists(tenantDbUrl: string): Promise<boolean> {
  const normalized = tenantDbUrl.trim().replace(/^postgres:\/\//, 'postgresql://')
  const client = new Client({ connectionString: normalized })
  await client.connect()
  try {
    const res = await client.query<{ exists: boolean }>(
      `select exists(
        select 1
        from information_schema.tables
        where table_schema = 'auth' and table_name = 'users'
      ) as exists`
    )
    return Boolean(res.rows[0]?.exists)
  } finally {
    await client.end()
  }
}

async function loadTenantDbUrlForRef(ref: string, actorId: string): Promise<string | null> {
  const row = await executeQuery<{
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, actorId],
    actorId,
  })
  if (row.error) throw row.error
  const p = row.data?.[0]
  if (!p) return null
  const enc = (p.connection_string_enc ?? '').trim()
  const url = enc.length > 0 ? decryptString(enc) : p.connection_string
  return url?.trim() || null
}

export async function waitForTenantAuthUsersTable(
  tenantDbUrl: string,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 120_000
  const intervalMs = opts?.intervalMs ?? 2_000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await tenantAuthUsersTableExists(tenantDbUrl)) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return tenantAuthUsersTableExists(tenantDbUrl)
}

/**
 * Ensures GoTrue has created auth.users on a dedicated tenant database:
 * provisions the per-project stack (starts tenant-auth) when needed, then waits for migrations.
 */
export async function ensureTenantGoTrueAuthSchema({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<{
  ok: true
  alreadyReady: boolean
  provisioned: boolean
}> {
  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const actorId: string | undefined = normalized?.sub
  if (!actorId) throw new Error('Missing user session')

  const tenantDbUrl = await loadTenantDbUrlForRef(ref, actorId)
  if (!tenantDbUrl) {
    throw new Error(
      'This project does not have a dedicated tenant database yet. Create or repair the project database first.'
    )
  }

  if (await tenantAuthUsersTableExists(tenantDbUrl)) {
    const { repaired } = await ensureDataPlaneProvisionedIfMissing({
      claims,
      ref,
      reason: 'ensure_auth_schema_record',
    })
    return { ok: true, alreadyReady: true, provisioned: repaired }
  }

  if (!isDataPlaneProvisionerConfigured()) {
    throw new Error(
      'Auth schema is not initialized and the data-plane provisioner is not configured. Set DATA_PLANE_PROVISIONER_URL and DATA_PLANE_PROVISIONER_TOKEN, then use Project Settings → Infrastructure → Write compose & apply.'
    )
  }

  await provisionTenantDataPlaneStack({
    claims,
    ref,
    apply: true,
    reason: 'ensure_auth_schema',
  })

  const normalizedUrl = tenantDbUrl.trim().replace(/^postgres:\/\//, 'postgresql://')
  const dbUrl = new URL(normalizedUrl)
  const dbName = dbUrl.pathname.replace(/^\//, '')
  const auxPass =
    process.env.SAAS_DATA_PLANE_AUX_ROLE_PASSWORD?.trim() ||
    (dbUrl.password ? decodeURIComponent(dbUrl.password) : '')
  if (dbName && auxPass) {
    await syncTenantAuxRolePasswords({
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port || '5432', 10),
      dbName,
      auxiliaryRolePassword: auxPass,
      tenantRolePassword: dbUrl.password ? decodeURIComponent(dbUrl.password) : undefined,
    })
    await grantTenantAuxDatabasePrivileges({
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port || '5432', 10),
      dbName,
      auxiliaryRolePassword: auxPass,
      tenantRolePassword: dbUrl.password ? decodeURIComponent(dbUrl.password) : undefined,
    })
  }

  const ready = await waitForTenantAuthUsersTable(tenantDbUrl)
  if (!ready) {
    throw new Error(
      'GoTrue did not create auth.users in time. Check tenant-auth logs on the host (docker compose for this project ref) and retry.'
    )
  }

  if (dbName && auxPass && dbUrl.username) {
    await grantTenantRoleAuthRead({
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port || '5432', 10),
      dbName,
      tenantRoleName: decodeURIComponent(dbUrl.username),
      auxiliaryRolePassword: auxPass,
      tenantRolePassword: dbUrl.password ? decodeURIComponent(dbUrl.password) : undefined,
    })
    await grantTenantPostgresAuthReferences({
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port || '5432', 10),
      dbName,
      auxiliaryRolePassword: auxPass,
      tenantRolePassword: dbUrl.password ? decodeURIComponent(dbUrl.password) : undefined,
    })
  }

  return { ok: true, alreadyReady: false, provisioned: true }
}

export async function ensureTenantGoTrueAuthSchemaForActor({
  ref,
  actorId,
}: {
  ref: string
  actorId: string
}) {
  return ensureTenantGoTrueAuthSchema({ claims: claimsFromActorId(actorId), ref })
}
