import type { JwtPayload } from '@indobaseinc/indobase-js'

import crypto from 'node:crypto'

import { executeQuery } from './query'
import { decryptString, encryptString, encryptedConnectionForPgMeta } from './util'
import { makeRandomString } from 'lib/helpers'
import { PROJECT_ENDPOINT, PROJECT_REST_URL } from 'lib/constants/api'
import { resolvePublicDomainForTenantStack, resolveSaaSTenantRestUrls } from './tenant-public-urls'
import {
  tenantEdgeRuntimeMemLimit,
  tenantImgproxyDownloadBufferBytes,
  tenantImgproxyDownloadTimeoutSeconds,
  tenantPostgrestDbMaxRows,
  tenantPostgrestDbPool,
  tenantPostgrestMemLimit,
  tenantPostgrestPoolAcquisitionTimeout,
  tenantPostgrestPoolMaxIdletime,
  tenantRealtimeDbPoolSize,
  tenantRealtimeRlimitNofile,
  tenantStorageFileSizeLimitBytes,
} from './tenant-data-plane-tuning'
import {
  assertValidTenantComposeYaml,
  repairKnownTenantComposeYaml,
} from './tenant-compose-validation'
import {
  bootstrapMinimalSupabaseRoles,
  bootstrapTenantDataPlaneSchemas,
  bootstrapTenantDatabaseExtensions,
  resolveTenantProvisionAdminUser,
  provisionTenantDatabase,
  runTenantDataPlaneBootstrapFromConnectionString,
  setTenantRolePassword,
} from './provision-tenant-db'
import { recordAuditLog } from './audit'
import { makeProjectJwt, resolveProjectJwtSecret } from './project-jwt'
import {
  assertOrganizationNotPlatformSuspendedById,
  assertOrganizationNotPlatformSuspendedBySlug,
  buildTenantSupavisorPoolerExs,
  composeYamlSingleQuoted,
  computeDataPlanePortBase,
  getGotrueUserId,
  getPrimaryEmail,
  indentLinesForComposeConfig,
  postgresJdbcUrlToEcto,
  postgresUrlWithDbRole,
  sanitizeComposeRefToken,
  slugify,
  uniqueProjectRef,
  type Claims,
} from './platform-shared'
import { getOrganization, listOrganizationMembers } from './platform-organizations'
import { ensureSaasTables } from './platform-schema'

export async function listProjects({
  claims,
  limit,
  offset,
  search,
}: {
  claims: Claims
  limit?: number
  offset?: number
  search?: string
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const qLimit = Math.min(Math.max(limit ?? 100, 1), 200)
  const qOffset = Math.max(offset ?? 0, 0)
  const qSearch = search?.trim()

  const count = await executeQuery<{ count: string }>({
    query: `
      select count(*)::text as count
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where m.gotrue_id = $1
        and p.is_branch = false
      ${qSearch ? `and (p.name ilike '%' || $2 || '%' or p.ref ilike '%' || $2 || '%')` : ''}
    `,
    parameters: qSearch ? [gotrueId, qSearch] : [gotrueId],
    actorId: gotrueId,
  })
  if (count.error) throw count.error

  const projects = await executeQuery<{
    id: number
    ref: string
    name: string
    organization_id: number
    organization_slug: string
    cloud_provider: string
    region: string
    status: string
    inserted_at: string | null
    is_branch: boolean
    preview_branch_refs: string[]
    preview_branching_enabled: boolean
    subscription_id: string
    has_dedicated_database: boolean
    data_plane_last_provisioned_at: string | null
    data_plane_last_provision_ok: string | null
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.name,
        p.organization_id,
        p.organization_slug,
        p.cloud_provider,
        p.region,
        p.status,
        p.inserted_at as inserted_at,
        p.is_branch,
        p.preview_branch_refs,
        coalesce(p.preview_branching_enabled, false) as preview_branching_enabled,
        p.subscription_id,
        (coalesce(trim(p.connection_string_enc), '') <> '' or coalesce(trim(p.connection_string), '') <> '') as has_dedicated_database,
        p.data_plane_last_provisioned_at,
        (p.data_plane_last_provision_result->>'ok') as data_plane_last_provision_ok
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where m.gotrue_id = $1
        and p.is_branch = false
      ${qSearch ? `and (p.name ilike '%' || $2 || '%' or p.ref ilike '%' || $2 || '%')` : ''}
      order by p.name asc
      limit $${qSearch ? 3 : 2} offset $${qSearch ? 4 : 3}
    `,
    parameters: qSearch ? [gotrueId, qSearch, qLimit, qOffset] : [gotrueId, qLimit, qOffset],
    actorId: gotrueId,
  })
  if (projects.error) throw projects.error

  return {
    pagination: {
      count: parseInt(count.data?.[0]?.count ?? '0', 10),
      limit: qLimit,
      offset: qOffset,
    },
    projects: (projects.data ?? []).map((p) => ({
      cloud_provider: p.cloud_provider,
      id: p.id,
      inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : null,
      is_branch_enabled:
        !p.is_branch &&
        (process.env.SAAS_BRANCHING_ENABLED !== 'false' ||
          Boolean(p.preview_branching_enabled) ||
          (p.preview_branch_refs?.length ?? 0) > 0),
      is_physical_backups_enabled: false,
      name: p.name,
      organization_id: p.organization_id,
      organization_slug: p.organization_slug,
      preview_branch_refs: p.preview_branch_refs ?? [],
      ref: p.ref,
      region: p.region,
      status: p.status,
      subscription_id: p.subscription_id ?? null,
      has_dedicated_database: p.has_dedicated_database,
      data_plane_last_provisioned_at: p.data_plane_last_provisioned_at
        ? new Date(p.data_plane_last_provisioned_at).toISOString()
        : null,
      data_plane_last_provision_ok:
        p.data_plane_last_provision_ok === 'true'
          ? true
          : p.data_plane_last_provision_ok === 'false'
            ? false
            : null,
    })),
  }
}

/**
 * Promote PROVISIONING → ACTIVE_HEALTHY only when the tenant data plane is reachable.
 * When the provisioner is not configured, promotion is unconditional (legacy shared-DB mode).
 */
async function promoteProjectToActiveHealthy({
  projectRef,
  gotrueId,
  portBase,
}: {
  projectRef: string
  gotrueId: string
  portBase?: number | null
}): Promise<boolean> {
  const { isDataPlaneProvisionerConfigured } = await import('./tenant-data-plane-provision')
  if (isDataPlaneProvisionerConfigured()) {
    const { isTenantDataPlaneReachable } = await import('./tenant-data-plane-health')
    const reachable = await isTenantDataPlaneReachable(projectRef, portBase)
    if (!reachable) return false
  }

  const saved = await executeQuery({
    query: `
      update saas.projects p
      set status = 'ACTIVE_HEALTHY'
      where p.ref = $1
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = p.organization_id
            and m.gotrue_id = $2
            and m.role in ('owner','admin','developer')
        )
    `,
    parameters: [projectRef, gotrueId],
    actorId: gotrueId,
  })
  if (saved.error) throw saved.error
  return true
}

/**
 * Finishes dedicated-tenant provisioning after insert (or repairs a stuck PROVISIONING row).
 * Idempotent: reuses existing tenant DB/role when present.
 */
export async function finalizeDedicatedProjectProvisioning({
  projectRef,
  gotrueId,
  deleteOnFailure,
  userDbPass,
}: {
  projectRef: string
  gotrueId: string
  deleteOnFailure: boolean
  userDbPass?: string
}): Promise<void> {
  const dedicatedOnCreate = process.env.SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE !== 'false'

  if (!dedicatedOnCreate) {
    const saved = await executeQuery({
      query: `
      update saas.projects p
      set status = 'ACTIVE_HEALTHY',
          data_plane_port_base = null,
          connection_string = null,
          connection_string_enc = null
      where p.ref = $1
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = p.organization_id
            and m.gotrue_id = $2
            and m.role in ('owner','admin','developer')
        )
    `,
      parameters: [projectRef, gotrueId],
      actorId: gotrueId,
    })
    if (saved.error) throw saved.error
    return
  }

  const host = process.env.POSTGRES_HOST?.trim()
  const adminPassword = process.env.POSTGRES_PASSWORD ?? ''
  const adminUser = resolveTenantProvisionAdminUser()
  const port = parseInt(process.env.POSTGRES_PORT || '5432', 10)
  if (!host || !adminPassword) {
    throw new Error(
      'Dedicated project databases require POSTGRES_HOST and POSTGRES_PASSWORD on the Studio server. Set SAAS_DEDICATED_DATABASE_ON_PROJECT_CREATE=false to use legacy shared-database (Model A) mode.'
    )
  }

  try {
    const provisioned = await provisionTenantDatabase({
      projectRef,
      host,
      port,
      adminUser,
      adminPassword,
    })
    await bootstrapTenantDatabaseExtensions({
      host,
      port,
      adminUser,
      adminPassword,
      dbName: provisioned.dbName,
    })
    await bootstrapMinimalSupabaseRoles({
      host,
      port,
      adminUser,
      adminPassword,
      dbName: provisioned.dbName,
      tenantRoleName: provisioned.roleName,
    })
    await bootstrapTenantDataPlaneSchemas({
      host,
      port,
      adminUser,
      adminPassword,
      dbName: provisioned.dbName,
      tenantRolePassword: provisioned.rolePassword,
      auxiliaryRolePassword:
        process.env.SAAS_DATA_PLANE_AUX_ROLE_PASSWORD?.trim() || provisioned.rolePassword,
    })

    const effectiveUserDbPass = (process.env.SAAS_APPLY_USER_DB_PASS_ON_CREATE !== 'false'
      ? userDbPass
      : ''
    )?.trim()
    let connectionString = provisioned.connectionString
    if (effectiveUserDbPass && effectiveUserDbPass.length >= 8) {
      await setTenantRolePassword({
        host,
        port,
        adminUser,
        adminPassword,
        dbName: provisioned.dbName,
        tenantRoleName: provisioned.roleName,
        password: effectiveUserDbPass,
      })
      const u = new URL(connectionString.replace(/^postgres:\/\//, 'postgresql://'))
      u.password = encodeURIComponent(effectiveUserDbPass)
      connectionString = u.toString()
    }

    const enc = encryptString(connectionString)
    const portBase = computeDataPlanePortBase(projectRef)
    const claims = { sub: gotrueId } as Claims
    const saved = await executeQuery({
      query: `
          update saas.projects p
          set data_plane_port_base = $1,
              connection_string = null,
              connection_string_enc = $2,
              db_host = $3
          where p.ref = $4
            and exists (
              select 1
              from saas.organization_members m
              where m.organization_id = p.organization_id
                and m.gotrue_id = $5
                and m.role in ('owner','admin','developer')
            )
        `,
      parameters: [portBase, enc, host, projectRef, gotrueId],
      actorId: gotrueId,
    })
    if (saved.error) throw saved.error

    if (process.env.SAAS_AUTO_PROVISION_DATA_PLANE_ON_CREATE !== 'false') {
      const {
        isDataPlaneProvisionerConfigured,
        provisionTenantDataPlaneStack,
      } = await import('./tenant-data-plane-provision')
      if (isDataPlaneProvisionerConfigured()) {
        try {
          await provisionTenantDataPlaneStack({
            claims,
            ref: projectRef,
            apply: true,
            reason: 'project_create',
          })
          const { ensureTenantGoTrueAuthSchemaForActor } = await import('./tenant-gotrue-schema')
          await ensureTenantGoTrueAuthSchemaForActor({ ref: projectRef, actorId: gotrueId })
        } catch (e) {
          await recordDataPlaneProvisionFailure({
            claims,
            ref: projectRef,
            error: e,
            reason: 'project_create',
          }).catch(() => undefined)
          console.warn(
            '[saas] data-plane provision failed for %s; staying PROVISIONING until auto-repair succeeds: %O',
            projectRef,
            e
          )
          return
        }
      }
    }

    const promoted = await promoteProjectToActiveHealthy({
      projectRef,
      gotrueId,
      portBase,
    })
    if (!promoted) {
      await recordDataPlaneProvisionFailure({
        claims,
        ref: projectRef,
        error: new Error('Tenant data plane unreachable after provision'),
        reason: 'project_create',
      }).catch(() => undefined)
      console.warn(
        '[saas] data-plane health check failed for %s; staying PROVISIONING until auto-repair succeeds',
        projectRef
      )
    }
  } catch (err) {
    if (deleteOnFailure) {
      await executeQuery({
        query: 'delete from saas.projects where ref = $1',
        parameters: [projectRef],
        actorId: gotrueId,
      })
    }
    throw err
  }
}

/**
 * Provisions a per-project tenant database for legacy Model A projects (shared control-plane DB).
 * Idempotent when a dedicated connection string is already stored on the project row.
 */
export async function provisionDedicatedTenantDatabaseForProject({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const gotrueId = getGotrueUserId(claims)
  const row = await executeQuery<{
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer')
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) {
    throw new Error('Project not found')
  }
  const p = row.data[0]!
  if ((p.connection_string_enc ?? '').trim() || (p.connection_string ?? '').trim()) {
    return { ok: true as const, alreadyProvisioned: true }
  }

  await finalizeDedicatedProjectProvisioning({
    projectRef: ref,
    gotrueId,
    deleteOnFailure: false,
  })

  return { ok: true as const, alreadyProvisioned: false }
}

/** Repair projects left in PROVISIONING when tenant DB exists but control-plane row was not finalized. */
async function tryCompleteStuckProvisioningProject({
  ref,
  gotrueId,
}: {
  ref: string
  gotrueId: string
}): Promise<void> {
  const row = await executeQuery<{
    status: string
    connection_string_enc: string | null
    data_plane_port_base: number | null
  }>({
    query: `select status, connection_string_enc, data_plane_port_base from saas.projects where ref = $1`,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  const p = row.data?.[0]
  if (!p || p.status !== 'PROVISIONING') return

  if (p.connection_string_enc?.trim()) {
    const claims = { sub: gotrueId } as Claims
    try {
      const { ensureTenantDataPlaneHealthy } = await import('./tenant-data-plane-provision')
      await ensureTenantDataPlaneHealthy({
        claims,
        ref,
        reason: 'stuck_provisioning_repair',
        force: true,
      })
    } catch (e) {
      console.warn('[saas] data-plane repair after stuck provisioning for %s: %O', ref, e)
      return
    }

    const promoted = await promoteProjectToActiveHealthy({
      projectRef: ref,
      gotrueId,
      portBase: p.data_plane_port_base,
    })
    if (!promoted) {
      console.warn('[saas] stuck provisioning for %s: data plane still unreachable', ref)
    }
    return
  }

  try {
    await finalizeDedicatedProjectProvisioning({
      projectRef: ref,
      gotrueId,
      deleteOnFailure: false,
    })
  } catch (e) {
    console.warn('[saas] tryCompleteStuckProvisioningProject failed for %s: %O', ref, e)
  }
}

export async function createProject({
  claims,
  body,
}: {
  claims: Claims
  body: {
    name: string
    organization_slug: string
    db_pass: string
    cloud_provider: string
    db_region?: string
    region_selection?: { code?: string }
    desired_instance_size?: string
    data_api_exposed_schemas?: string[]
    data_api_use_api_schema?: boolean
    postgres_engine?: string
    release_channel?: string
  }
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const jwtSecret = resolveProjectJwtSecret(null)

  const orgRows = await executeQuery<{
    id: number
    organization_slug: string
    role: string
  }>({
    query: `
      select o.id, o.slug as organization_slug, m.role
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [body.organization_slug, gotrueId],
    actorId: gotrueId,
  })
  if (orgRows.error) throw orgRows.error
  if (!orgRows.data?.length) throw new Error('Organization not found')
  if (orgRows.data[0].role === 'viewer') throw new Error('Insufficient permissions to create projects')

  const org = orgRows.data[0]
  await assertOrganizationNotPlatformSuspendedById(org.id, gotrueId)
  const ref = uniqueProjectRef(body.name)
  const region = body.db_region || body.region_selection?.code || 'local'
  const anonKey = makeProjectJwt(jwtSecret, 'anon', ref)
  const serviceKey = makeProjectJwt(jwtSecret, 'service_role', ref)

  const inserted = await executeQuery<{
    id: number
    ref: string
    name: string
    organization_id: number
    organization_slug: string
    cloud_provider: string
    region: string
    status: string
    inserted_at: string
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
        service_key_enc,
        anon_key_enc,
        subscription_id,
        rest_url,
        db_host,
        connection_string,
        connection_string_enc,
        db_pass_enc
      ) values (
        $1, $2, $3, $4, $5, $6, 'PROVISIONING',
        '', '', $7, $8,
        '',
        $9, '127.0.0.1', null, null, $10
      )
      returning id, ref, name, organization_id, organization_slug, cloud_provider, region, status, inserted_at
    `,
    parameters: [
      org.id,
      body.organization_slug,
      ref,
      body.name,
      body.cloud_provider || 'localhost',
      region,
      encryptString(serviceKey),
      encryptString(anonKey),
      PROJECT_REST_URL,
      encryptString(body.db_pass),
    ],
    actorId: gotrueId,
  })

  if (inserted.error || !inserted.data?.length) throw inserted.error ?? new Error('Failed to create project')
  const p = inserted.data[0]

  try {
    await finalizeDedicatedProjectProvisioning({
      projectRef: p.ref,
      gotrueId,
      deleteOnFailure: true,
      userDbPass: body.db_pass,
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('POSTGRES_HOST')) {
      await executeQuery({
        query: 'delete from saas.projects where ref = $1',
        parameters: [p.ref],
        actorId: gotrueId,
      })
    }
    throw err
  }

  await recordAuditLog({
    claims,
    organizationId: p.organization_id,
    projectRef: p.ref,
    action: 'project.create',
    targetType: 'project',
    targetDescription: `Project "${p.name}" (${p.ref})`,
    metadata: { project_id: p.id, organization_slug: p.organization_slug },
  })

  const statusRow = await executeQuery<{ status: string }>({
    query: `select status from saas.projects where ref = $1 limit 1`,
    parameters: [p.ref],
    actorId: gotrueId,
  })
  const projectStatus = statusRow.data?.[0]?.status ?? 'PROVISIONING'

  return {
    anon_key: anonKey,
    cloud_provider: p.cloud_provider,
    endpoint: PROJECT_ENDPOINT,
    id: p.id,
    name: p.name,
    organization_id: p.organization_id,
    organization_slug: p.organization_slug,
    preview_branch_refs: [],
    ref: p.ref,
    region: p.region,
    service_key: serviceKey,
    status: projectStatus,
    subscription_id: null,
    inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : null,
    is_branch_enabled: process.env.SAAS_BRANCHING_ENABLED !== 'false',
    is_physical_backups_enabled: false,
  }
}

export async function getProject({ claims, ref }: { claims: Claims; ref: string }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  await tryCompleteStuckProvisioningProject({ ref, gotrueId })
  void import('./tenant-data-plane-provision')
    .then(({ ensureDataPlaneProvisionedIfMissingForActor }) =>
      ensureDataPlaneProvisionedIfMissingForActor({
        ref,
        actorId: gotrueId,
        reason: 'get_project',
      })
    )
    .catch((e) => {
      console.warn('[saas] data-plane auto-repair skipped for %s: %O', ref, e)
    })

  const rows = await executeQuery<{
    id: number
    ref: string
    name: string
    organization_id: number
    organization_slug: string
    cloud_provider: string
    region: string
    status: string
    inserted_at: string | null
    is_branch: boolean
    parent_project_ref: string | null
    preview_branch_refs: string[]
    preview_branching_enabled: boolean
    service_key: string
    anon_key: string
    connection_string: string | null
    connection_string_enc: string | null
    data_plane_last_provisioned_at: string | null
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.name,
        p.organization_id,
        p.organization_slug,
        p.cloud_provider,
        p.region,
        p.status,
        p.inserted_at,
        p.is_branch,
        p.parent_project_ref,
        p.preview_branch_refs,
        coalesce(p.preview_branching_enabled, false) as preview_branching_enabled,
        p.service_key,
        p.anon_key,
        p.connection_string,
        p.connection_string_enc,
        p.data_plane_last_provisioned_at
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })

  if (rows.error) throw rows.error

  if (!rows.data?.length) return null

  const p = rows.data[0]
  const tenantDatabaseUrl =
    p.connection_string_enc && p.connection_string_enc.trim()
      ? decryptString(p.connection_string_enc)
      : p.connection_string

  // Lazy backfill: migrate plaintext -> encrypted-at-rest when an owner/admin loads the project.
  // Keeps existing deployments working without requiring a one-off script.
  if (
    tenantDatabaseUrl?.trim() &&
    (!p.connection_string_enc || !p.connection_string_enc.trim()) &&
    p.connection_string?.trim()
  ) {
    const migrate = await executeQuery({
      query: `
        update saas.projects p
        set connection_string = null,
            connection_string_enc = $1
        where p.ref = $2
          and exists (
            select 1
            from saas.organization_members m
            where m.organization_id = p.organization_id
              and m.gotrue_id = $3
              and m.role in ('owner','admin')
          )
      `,
      parameters: [encryptString(tenantDatabaseUrl), p.ref, gotrueId],
      actorId: gotrueId,
    })
    if (migrate.error) throw migrate.error
  }

  // Prefer per-project database URI (encrypted). Fall back to shared POSTGRES_* when unset (legacy Model A).
  const sharedDbUrl =
    process.env.POSTGRES_PASSWORD && process.env.POSTGRES_HOST && process.env.POSTGRES_DB
      ? `postgres://${process.env.POSTGRES_USER ?? 'postgres'}:${process.env.POSTGRES_PASSWORD}@${
          process.env.POSTGRES_HOST
        }:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB}`
      : null

  const effectiveDbUrl = tenantDatabaseUrl?.trim() ? tenantDatabaseUrl : sharedDbUrl
  const hasDedicated = Boolean(tenantDatabaseUrl?.trim())
  const { restUrl } = resolveSaaSTenantRestUrls(p.ref, hasDedicated)
  return {
    cloud_provider: p.cloud_provider,
    // pg-meta expects `x-connection-encrypted` header value to be encrypted.
    // The frontend forwards this `connectionString` into that header.
    // Per-tenant DB: plaintext URI in saas.projects.connection_string; else POSTGRES_* fallback.
    connectionString: encryptedConnectionForPgMeta(effectiveDbUrl ?? ''),
    db_host: process.env.POSTGRES_HOST || '127.0.0.1',
    id: p.id,
    inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : new Date(0).toISOString(),
    is_branch_enabled:
      !p.is_branch &&
      (process.env.SAAS_BRANCHING_ENABLED !== 'false' ||
        Boolean(p.preview_branching_enabled) ||
        (p.preview_branch_refs?.length ?? 0) > 0),
    is_physical_backups_enabled: false,
    name: p.name,
    organization_id: p.organization_id,
    organization_slug: p.organization_slug,
    parent_project_ref: p.parent_project_ref ?? undefined,
    ref: p.ref,
    region: p.region,
    restUrl,
    status: p.status,
    subscription_id: '',
  }
}

function parsePostgresUrlForSupavisorDisplay(url: string): {
  host: string
  port: number
  database: string
  user: string
} | null {
  try {
    const u = new URL(url.trim().replace(/^postgres:\/\//, 'postgresql://'))
    const db = (u.pathname.replace(/^\//, '') || 'postgres').split('?')[0]!
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 5432,
      database: db,
      user: u.username ? decodeURIComponent(u.username) : 'postgres',
    }
  } catch {
    return null
  }
}

type SupavisorConfigRow = {
  connection_string: string
  connectionString: string
  database_type: 'PRIMARY' | 'READ_REPLICA'
  db_host: string
  db_name: string
  db_port: number
  db_user: string
  default_pool_size: number | null
  identifier: string
  is_using_scram_auth: boolean
  max_client_conn: number | null
  pool_mode: 'transaction' | 'session'
}

/**
 * Supavisor-shaped rows for Connect / pooling UI.
 * Dedicated DB: `db_*` come from the decrypted tenant connection URL (no password returned).
 * Optional pooler URI when `SAAS_TENANT_POOLER_HOST` is set (Supavisor-style `postgres.<ref>` user).
 */
export async function getSaaSSupavisorConfigRows({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<SupavisorConfigRow[] | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims as Claims)

  const row = await executeQuery<{
    ref: string
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.ref, p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) return null

  const p = row.data[0]!
  const enc = (p.connection_string_enc ?? '').trim()
  const tenantUrl = enc.length > 0 ? decryptString(enc) : p.connection_string
  const parsed = tenantUrl?.trim() ? parsePostgresUrlForSupavisorDisplay(tenantUrl.trim()) : null

  const dbHost = parsed?.host ?? (process.env.POSTGRES_HOST || '127.0.0.1')
  const dbName = parsed?.database ?? (process.env.POSTGRES_DB || 'postgres')
  const dbPort = parsed?.port ?? parseInt(process.env.POSTGRES_PORT || '5432', 10)
  const dbUser = parsed?.user ?? (process.env.POSTGRES_USER || 'postgres')

  const primary: SupavisorConfigRow = {
    connection_string: '',
    connectionString: '',
    database_type: 'PRIMARY',
    db_host: dbHost,
    db_name: dbName,
    db_port: dbPort,
    db_user: dbUser,
    default_pool_size: null,
    identifier: ref,
    is_using_scram_auth: false,
    max_client_conn: null,
    pool_mode: 'transaction',
  }

  const out: SupavisorConfigRow[] = [primary]

  const embedPooler = process.env.SAAS_TENANT_EMBED_SUPAVISOR === 'true'
  const poolHost =
    process.env.SAAS_TENANT_POOLER_HOST?.trim() ||
    (embedPooler && parsed
      ? `${ref}.${resolvePublicDomainForTenantStack().trim() || 'localhost'}`
      : '')
  if (poolHost && parsed) {
    const poolPort = parseInt(process.env.SAAS_TENANT_POOLER_PORT || '6543', 10)
    const poolUser = `postgres.${ref}`
    const poolUri = `postgresql://${encodeURIComponent(poolUser)}@${poolHost}:${poolPort}/${encodeURIComponent(parsed.database)}`
    out.push({
      connection_string: poolUri,
      connectionString: poolUri,
      database_type: 'READ_REPLICA',
      db_host: poolHost,
      db_name: parsed.database,
      db_port: poolPort,
      db_user: poolUser,
      default_pool_size: null,
      identifier: `${ref}-pooler`,
      is_using_scram_auth: false,
      max_client_conn: null,
      pool_mode: 'transaction',
    })
  }

  return out
}

/**
 * Payload for `/api/platform/props/project/[ref]/api` — real project ref, keys, and API host.
 * Dedicated-tenant DB: `endpoint` = `ref.<SAAS_PUBLIC_DOMAIN>` and REST URL on that host (per Traefik).
 * Shared stack: uses `SUPABASE_PUBLIC_URL` from env (same as Kong).
 */
export async function getSaaSProjectPropsApiPayload({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<{
  project: Record<string, unknown>
  autoApiService: Record<string, unknown>
} | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims as Claims)

  const row = await executeQuery<{
    id: number
    ref: string
    name: string
    organization_id: number
    organization_slug: string
    cloud_provider: string
    region: string
    status: string
    inserted_at: string | null
    service_key: string
    anon_key: string
    service_key_enc: string | null
    anon_key_enc: string | null
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.name,
        p.organization_id,
        p.organization_slug,
        p.cloud_provider,
        p.region,
        p.status,
        p.inserted_at,
        p.service_key,
        p.anon_key,
        p.service_key_enc,
        p.anon_key_enc,
        p.connection_string,
        p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) return null

  const p = row.data[0]!
  const anon = p.anon_key_enc?.trim() ? decryptString(p.anon_key_enc) : p.anon_key
  const service = p.service_key_enc?.trim() ? decryptString(p.service_key_enc) : p.service_key

  const enc = (p.connection_string_enc ?? '').trim()
  const tenantDbUrl = enc.length > 0 ? decryptString(enc) : p.connection_string
  const hasDedicated = Boolean(tenantDbUrl?.trim())

  const { endpointHost, restUrl, protocol: endpointProtocol } = resolveSaaSTenantRestUrls(p.ref, hasDedicated)

  const pgHost = process.env.POSTGRES_HOST || '127.0.0.1'
  const pgPort = parseInt(process.env.POSTGRES_PORT || '5432', 10)
  const pgDb = process.env.POSTGRES_DB || 'postgres'
  const pgUser = process.env.POSTGRES_USER || 'postgres'

  const insertedAt = p.inserted_at ? new Date(p.inserted_at).toISOString() : new Date(0).toISOString()

  const project = {
    id: p.id,
    ref: p.ref,
    name: p.name,
    organization_id: p.organization_id,
    organization_slug: p.organization_slug,
    cloud_provider: p.cloud_provider,
    region: p.region,
    status: p.status,
    inserted_at: insertedAt,
    api_key_supabase_encrypted: '',
    db_host: pgHost,
    db_name: pgDb,
    db_port: pgPort,
    db_ssl: false,
    db_user: pgUser,
    services: [
      {
        id: 1,
        name: 'Default API',
        app: { id: 1, name: 'Auto API' },
        app_config: {
          db_schema: 'public',
          endpoint: endpointHost,
          realtime_enabled: true,
        },
        service_api_keys: [
          { api_key_encrypted: '-', name: 'service_role key', tags: 'service_role' },
          { api_key_encrypted: '-', name: 'anon key', tags: 'anon' },
        ],
      },
    ],
  }

  const autoApiService = {
    id: 1,
    name: 'Default API',
    project: { ref: p.ref },
    app: { id: 1, name: 'Auto API' },
    app_config: {
      db_schema: 'public',
      endpoint: endpointHost,
      realtime_enabled: true,
    },
    protocol: endpointProtocol,
    endpoint: endpointHost,
    restUrl,
    defaultApiKey: anon,
    serviceApiKey: service,
    service_api_keys: [
      { api_key_encrypted: '-', name: 'service_role key', tags: 'service_role' },
      { api_key_encrypted: '-', name: 'anon key', tags: 'anon' },
    ],
  }

  return { project, autoApiService }
}

/** Org-level props for `/api/platform/props/org/[slug]` (billing UI expects stable keys). */
export async function getSaaSOrgPropsPayload({
  claims,
  slug,
}: {
  claims: JwtPayload
  slug: string
}): Promise<{
  members: { gotrue_id: string; role: string; inserted_at: string }[]
  products: unknown[]
  customer: {
    customer: Record<string, unknown>
    subscriptions: Record<string, unknown>
    total_paid_projects: number
    total_free_projects: number
    total_pro_projects: number
    total_team_projects: number
    total_payg_projects: number
  }
} | null> {
  const c = claims as Claims
  const org = await getOrganization({ claims: c, slug })
  if (!org) return null

  const members = await listOrganizationMembers({ claims: c, slug })
  const gotrueId = getGotrueUserId(c)

  const cnt = await executeQuery<{ cnt: string }>({
    query: `
      select count(*)::text as cnt
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (cnt.error) throw cnt.error
  const total = parseInt(cnt.data?.[0]?.cnt ?? '0', 10) || 0

  return {
    members: members.map((m) => ({
      gotrue_id: m.gotrue_id,
      role: m.role,
      inserted_at: m.inserted_at,
    })),
    products: [],
    customer: {
      customer: {},
      subscriptions: {},
      total_paid_projects: 0,
      total_free_projects: total,
      total_pro_projects: 0,
      total_team_projects: 0,
      total_payg_projects: 0,
    },
  }
}

export async function bulkBackfillTenantDataPlaneBootstrap({
  claims,
  slug,
}: {
  claims: JwtPayload
  slug: string
}): Promise<{
  results: { ref: string; skipped: boolean; ok: boolean; message?: string }[]
} | null> {
  const c = claims as Claims
  const gotrueId = getGotrueUserId(c)

  const admin = await executeQuery<{ id: number }>({
    query: `
      select o.id
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin')
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (admin.error) throw admin.error
  if (!admin.data?.length) return null

  const rows = await executeQuery<{
    ref: string
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.ref, p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where o.slug = $1
      order by p.name asc
    `,
    parameters: [slug],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error

  const results: { ref: string; skipped: boolean; ok: boolean; message?: string }[] = []
  for (const p of rows.data ?? []) {
    const enc = (p.connection_string_enc ?? '').trim()
    const url = enc.length > 0 ? decryptString(enc) : p.connection_string
    if (!url?.trim()) {
      results.push({ ref: p.ref, skipped: true, ok: true, message: 'No dedicated tenant database URL' })
      continue
    }
    try {
      await runTenantDataPlaneBootstrapFromConnectionString(url.trim())
      results.push({ ref: p.ref, skipped: false, ok: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      results.push({ ref: p.ref, skipped: false, ok: false, message })
    }
  }

  return { results }
}

/** SMTP + mailer settings for tenant GoTrue (shared control-plane mail or SAAS_TENANT_SMTP_*). */
function resolveTenantGoTrueMailerEnv(opts: { apiExternalUrl: string; siteUrl: string }) {
  const smtpHost =
    process.env.SAAS_TENANT_SMTP_HOST?.trim() || process.env.SMTP_HOST?.trim() || 'indobase-mail'
  const smtpPort =
    process.env.SAAS_TENANT_SMTP_PORT?.trim() || process.env.SMTP_PORT?.trim() || '2500'
  const smtpUser = process.env.SAAS_TENANT_SMTP_USER?.trim() ?? process.env.SMTP_USER?.trim() ?? ''
  const smtpPass = process.env.SAAS_TENANT_SMTP_PASS?.trim() ?? process.env.SMTP_PASS?.trim() ?? ''
  const smtpAdminEmail =
    process.env.SAAS_TENANT_SMTP_ADMIN_EMAIL?.trim() ||
    process.env.SMTP_ADMIN_EMAIL?.trim() ||
    'auth@indobase.in'
  const smtpSenderName =
    process.env.SAAS_TENANT_SMTP_SENDER_NAME?.trim() ||
    process.env.SMTP_SENDER_NAME?.trim() ||
    'Indobase'
  const autoConfirmRaw =
    process.env.SAAS_TENANT_MAILER_AUTOCONFIRM?.trim() ??
    process.env.ENABLE_EMAIL_AUTOCONFIRM?.trim() ??
    'false'
  const autoConfirm = autoConfirmRaw === 'true' ? 'true' : 'false'

  const hosts = new Set<string>()
  for (const raw of [opts.apiExternalUrl, opts.siteUrl]) {
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
      if (u.hostname) hosts.add(u.hostname)
    } catch {
      // ignore
    }
  }
  for (const h of (process.env.SAAS_MAILER_EXTERNAL_HOSTS ?? '').split(',')) {
    const t = h.trim()
    if (t) hosts.add(t)
  }
  for (const raw of [
    process.env.SITE_URL?.trim(),
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    process.env.API_URL?.trim(),
    process.env.NEXT_PUBLIC_API_URL?.trim(),
  ]) {
    if (!raw) continue
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
      if (u.hostname) hosts.add(u.hostname)
    } catch {
      // ignore
    }
  }

  return {
    autoConfirm: composeYamlSingleQuoted(autoConfirm),
    externalHosts: composeYamlSingleQuoted([...hosts].join(',')),
    smtpHost: composeYamlSingleQuoted(smtpHost),
    smtpPort: composeYamlSingleQuoted(smtpPort),
    smtpUser: composeYamlSingleQuoted(smtpUser),
    smtpPass: composeYamlSingleQuoted(smtpPass),
    smtpAdminEmail: composeYamlSingleQuoted(smtpAdminEmail),
    smtpSenderName: composeYamlSingleQuoted(smtpSenderName),
  }
}

function buildSlimTenantDockerCompose(opts: {
  ref: string
  ports: {
    rest: number
    auth: number
    storage: number
    realtime: number
    functions: number
    pooler?: number
  }
  restDbUri: string
  authDbUri: string
  storageDbUri: string
  jwtSecret: string
  anonKey: string
  serviceKey: string
  apiExternalUrl: string
  siteUrl: string
  uriAllowList: string
  realtime: {
    dbHost: string
    dbPort: string
    dbName: string
    dbUser: string
    dbPassword: string
    secretKeyBase: string
    dbEncKey: string
  }
  /** When set, appends Supavisor (transaction pool on 6543) + compose `configs` for pooler.exs. */
  pooler?: {
    ectoMetadataUrl: string
    exsBody: string
    secretKeyBase: string
    vaultEncKey: string
    auxDbPassword: string
  } | null
}): string {
  const mailer = resolveTenantGoTrueMailerEnv({
    apiExternalUrl: opts.apiExternalUrl,
    siteUrl: opts.siteUrl,
  })
  const edgeMem = tenantEdgeRuntimeMemLimit()
  const pgrstMem = tenantPostgrestMemLimit()
  const pgrstPool = tenantPostgrestDbPool()
  const pgrstPoolAcquire = tenantPostgrestPoolAcquisitionTimeout()
  const pgrstPoolIdle = tenantPostgrestPoolMaxIdletime()
  const pgrstMaxRows = tenantPostgrestDbMaxRows()
  const rtNofile = tenantRealtimeRlimitNofile()
  const rtDbPool = tenantRealtimeDbPoolSize()
  const storageFileLimit = tenantStorageFileSizeLimitBytes()
  const imgproxyBuf = tenantImgproxyDownloadBufferBytes()
  const imgproxyDlTimeout = tenantImgproxyDownloadTimeoutSeconds()
  const poolerMaxClientConn = String(
    Math.max(50, parseInt(process.env.SAAS_TENANT_POOLER_MAX_CLIENT_CONN?.trim() || '400', 10) || 400)
  )
  const net = (process.env.SAAS_DOCKER_NETWORK_NAME || 'indobase_default').trim()
  const functionsHostPath = (
    process.env.SAAS_TENANT_FUNCTIONS_HOST_PATH || process.env.INDOBASE_FUNCTIONS_DIR || ''
  ).trim()
  const useBindMountFunctions = functionsHostPath.length > 0
  const functionsVolumeYaml = useBindMountFunctions
    ? `      - ${composeYamlSingleQuoted(functionsHostPath)}:/home/deno/functions:Z`
    : `      - tenant-functions-${opts.ref}:/home/deno/functions:Z`

  const restUri = composeYamlSingleQuoted(opts.restDbUri.trim())
  const authUri = composeYamlSingleQuoted(opts.authDbUri.trim())
  const storageUri = composeYamlSingleQuoted(opts.storageDbUri.trim())
  const jwt = composeYamlSingleQuoted(opts.jwtSecret)
  const apiEx = composeYamlSingleQuoted(opts.apiExternalUrl)
  const site = composeYamlSingleQuoted(opts.siteUrl)
  const allow = composeYamlSingleQuoted(opts.uriAllowList)
  const googleRedirectUri = composeYamlSingleQuoted(
    `${opts.apiExternalUrl.replace(/\/$/, '')}/auth/v1/callback`
  )
  const anon = composeYamlSingleQuoted(opts.anonKey)
  const svc = composeYamlSingleQuoted(opts.serviceKey)
  const googleClientId = composeYamlSingleQuoted(process.env.GOOGLE_CLIENT_ID?.trim() || '')
  const googleSecret = composeYamlSingleQuoted(process.env.GOOGLE_SECRET?.trim() || '')
  const googleEnabled = composeYamlSingleQuoted(
    process.env.GOOGLE_ENABLED === 'true' && (process.env.GOOGLE_CLIENT_ID?.trim() || '')
      ? 'true'
      : 'false'
  )
  const rtHost = composeYamlSingleQuoted(opts.realtime.dbHost)
  const rtPort = composeYamlSingleQuoted(opts.realtime.dbPort)
  const rtName = composeYamlSingleQuoted(opts.realtime.dbName)
  const rtUser = composeYamlSingleQuoted(opts.realtime.dbUser)
  const rtPass = composeYamlSingleQuoted(opts.realtime.dbPassword)
  const rtSkb = composeYamlSingleQuoted(opts.realtime.secretKeyBase)
  const rtEnc = composeYamlSingleQuoted(opts.realtime.dbEncKey)
  const bucket = composeYamlSingleQuoted(`tenant-${opts.ref}`)
  const imgproxyHost = `tenant-imgproxy-${opts.ref}`
  const tenantId = composeYamlSingleQuoted(opts.ref)
  const projectUrl = composeYamlSingleQuoted(opts.apiExternalUrl)

  const pool = opts.pooler
  const cfgName = pool && opts.ports.pooler != null ? `tpooler_exs_${sanitizeComposeRefToken(opts.ref)}` : ''
  const poolerServiceBlock =
    pool && opts.ports.pooler != null
      ? `
  tenant-pooler:
    image: supabase/supavisor:2.7.4
    container_name: supavisor-tenant-${sanitizeComposeRefToken(opts.ref)}
    restart: unless-stopped
    networks:
      - tenant_data_plane
    depends_on:
      tenant-realtime:
        condition: service_started
    ports:
      - "127.0.0.1:${opts.ports.pooler}:6543"
    environment:
      PORT: "4000"
      REGION: local
      API_JWT_SECRET: ${composeYamlSingleQuoted(opts.jwtSecret)}
      METRICS_JWT_SECRET: ${composeYamlSingleQuoted(opts.jwtSecret)}
      SECRET_KEY_BASE: ${composeYamlSingleQuoted(pool.secretKeyBase)}
      VAULT_ENC_KEY: ${composeYamlSingleQuoted(pool.vaultEncKey)}
      DATABASE_URL: ${composeYamlSingleQuoted(pool.ectoMetadataUrl)}
      CLUSTER_POSTGRES: "false"
      DB_POOL_SIZE: "5"
      POOLER_TENANT_ID: ${composeYamlSingleQuoted(opts.ref)}
      POOLER_DEFAULT_POOL_SIZE: "15"
      POOLER_MAX_CLIENT_CONN: "${poolerMaxClientConn}"
      POOLER_POOL_MODE: transaction
      TENANT_POOLER_AUX_DB_PASSWORD: ${composeYamlSingleQuoted(pool.auxDbPassword)}
    configs:
      - source: ${cfgName}
        target: /etc/pooler/pooler.exs
    command:
      - /bin/sh
      - -c
      - ${composeYamlSingleQuoted(
          '/app/bin/migrate && /app/bin/supavisor eval "$$(cat /etc/pooler/pooler.exs)" && /app/bin/server'
        )}
    healthcheck:
      test: ["CMD", "curl", "-sSfL", "--head", "-o", "/dev/null", "http://127.0.0.1:4000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 40s
`
      : ''

  const poolerConfigsBlock =
    pool && opts.ports.pooler != null && cfgName
      ? `
configs:
  ${cfgName}:
    content: |
${indentLinesForComposeConfig(pool.exsBody, '      ')}
`
      : ''

  return `# Generated by Studio — per-project data plane (PostgREST, GoTrue, Storage, Realtime, Functions, Imgproxy)
name: indobase-tenant-${opts.ref}

services:
  tenant-rest:
    image: postgrest/postgrest:v14.5
    restart: unless-stopped
    mem_limit: ${pgrstMem}
    networks:
      - tenant_data_plane
    environment:
      PGRST_DB_URI: ${restUri}
      PGRST_DB_SCHEMAS: public,storage,graphql_public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${jwt}
      PGRST_DB_POOL: "${pgrstPool}"
      PGRST_DB_POOL_ACQUISITION_TIMEOUT: "${pgrstPoolAcquire}"
      PGRST_DB_POOL_MAX_IDLETIME: "${pgrstPoolIdle}"
      PGRST_DB_MAX_ROWS: "${pgrstMaxRows}"
    ports:
      - "${opts.ports.rest}:3000"

  tenant-auth:
    image: supabase/gotrue:v2.186.0
    restart: unless-stopped
    networks:
      - tenant_data_plane
    environment:
      API_EXTERNAL_URL: ${apiEx}
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: "9999"
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: ${authUri}
      GOTRUE_SITE_URL: ${site}
      GOTRUE_URI_ALLOW_LIST: ${allow}
      GOTRUE_JWT_SECRET: ${jwt}
      GOTRUE_JWT_EXP: "3600"
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_DISABLE_SIGNUP: "false"
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
      GOTRUE_EXTERNAL_PHONE_ENABLED: "true"
      GOTRUE_MAILER_AUTOCONFIRM: ${mailer.autoConfirm}
      GOTRUE_MAILER_EXTERNAL_HOSTS: ${mailer.externalHosts}
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_INVITE: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_RECOVERY: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: /auth/v1/verify
      GOTRUE_MAILER_OTP_LENGTH: "6"
      GOTRUE_MAILER_OTP_EXP: "3600"
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: "true"
      GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: "10"
      GOTRUE_SECURITY_REFRESH_TOKEN_ALLOW_REUSE: "false"
      GOTRUE_SECURITY_REFRESH_TOKEN_ALGORITHM_VERSION: "2"
      GOTRUE_SECURITY_REFRESH_TOKEN_UPGRADE_PERCENTAGE: "100"
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: ${googleEnabled}
      GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${googleClientId}
      GOTRUE_EXTERNAL_GOOGLE_SECRET: ${googleSecret}
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${googleRedirectUri}
      GOTRUE_SMTP_HOST: ${mailer.smtpHost}
      GOTRUE_SMTP_PORT: ${mailer.smtpPort}
      GOTRUE_SMTP_USER: ${mailer.smtpUser}
      GOTRUE_SMTP_PASS: ${mailer.smtpPass}
      GOTRUE_SMTP_ADMIN_EMAIL: ${mailer.smtpAdminEmail}
      GOTRUE_SMTP_SENDER_NAME: ${mailer.smtpSenderName}
    ports:
      - "${opts.ports.auth}:9999"

  tenant-imgproxy:
    image: darthsim/imgproxy:v3.30.1
    restart: unless-stopped
    networks:
      - tenant_data_plane
    volumes:
      - tenant-storage-${opts.ref}:/var/lib/storage:Z
    environment:
      IMGPROXY_BIND: ":5001"
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /
      IMGPROXY_USE_ETAG: "true"
      IMGPROXY_ENABLE_WEBP_DETECTION: "true"
      IMGPROXY_MAX_SRC_RESOLUTION: "16.8"
      IMGPROXY_DOWNLOAD_BUFFER_SIZE: "${imgproxyBuf}"
      IMGPROXY_READ_REQUEST_TIMEOUT: "${imgproxyDlTimeout}"
    expose:
      - "5001"

  tenant-storage:
    image: supabase/storage-api:v1.37.8
    restart: unless-stopped
    depends_on:
      tenant-rest:
        condition: service_started
      tenant-imgproxy:
        condition: service_started
    networks:
      - tenant_data_plane
    environment:
      ANON_KEY: ${anon}
      SERVICE_KEY: ${svc}
      POSTGREST_URL: http://tenant-rest:3000
      PGRST_JWT_SECRET: ${jwt}
      DATABASE_URL: ${storageUri}
      REQUEST_ALLOW_X_FORWARDED_PATH: "true"
      FILE_SIZE_LIMIT: "${storageFileLimit}"
      STORAGE_BACKEND: file
      GLOBAL_S3_BUCKET: ${bucket}
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: ${tenantId}
      REGION: local
      ENABLE_IMAGE_TRANSFORMATION: "true"
      IMGPROXY_URL: http://${imgproxyHost}:5001
    volumes:
      - tenant-storage-${opts.ref}:/var/lib/storage:Z
    ports:
      - "${opts.ports.storage}:5000"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:5000/status"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s

  tenant-realtime:
    container_name: ${opts.ref}.indobase-realtime
    image: supabase/realtime:v2.76.5
    restart: unless-stopped
    networks:
      - tenant_data_plane
    environment:
      PORT: "4000"
      DB_HOST: ${rtHost}
      DB_PORT: ${rtPort}
      DB_USER: ${rtUser}
      DB_PASSWORD: ${rtPass}
      DB_NAME: ${rtName}
      DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime'
      DB_ENC_KEY: ${rtEnc}
      API_JWT_SECRET: ${jwt}
      SECRET_KEY_BASE: ${rtSkb}
      ERL_AFLAGS: -proto_dist inet_tcp
      DNS_NODES: "''"
      RLIMIT_NOFILE: "${rtNofile}"
      APP_NAME: realtime
      SEED_SELF_HOST: "true"
      RUN_JANITOR: "true"
      DISABLE_HEALTHCHECK_LOGGING: "true"
      DB_POOL_SIZE: "${rtDbPool}"
    ports:
      - "${opts.ports.realtime}:4000"
    healthcheck:
      test: ["CMD", "curl", "-sSf", "http://127.0.0.1:4000/"]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 40s

  tenant-functions:
    image: supabase/edge-runtime:v1.67.1
    restart: unless-stopped
    mem_limit: ${edgeMem}
    depends_on:
      tenant-rest:
        condition: service_started
    networks:
      - tenant_data_plane
    environment:
      JWT_SECRET: ${jwt}
      SUPABASE_URL: ${projectUrl}
      SUPABASE_ANON_KEY: ${anon}
      SUPABASE_SERVICE_ROLE_KEY: ${svc}
      VERIFY_JWT: "false"
    volumes:
${functionsVolumeYaml}
    command:
      - start
      - --main-service
      - /home/deno/functions/main
    ports:
      - "${opts.ports.functions}:9000"${poolerServiceBlock}${poolerConfigsBlock}
networks:
  tenant_data_plane:
    external: true
    name: ${net}

volumes:
  tenant-storage-${opts.ref}:
${useBindMountFunctions ? '' : `  tenant-functions-${opts.ref}:\n`}
`
}

function traefikUpstreamHost(): string {
  const fromEnv = process.env.TRAEFIK_UPSTREAM_HOST?.trim()
  if (fromEnv) return fromEnv
  // Dokploy/Traefik runs in Docker; tenant ports must be reachable on the docker bridge (not 127.0.0.1 inside Traefik).
  return '172.17.0.1'
}

function buildSlimTenantTraefikYml(opts: {
  ref: string
  publicDomain: string
  ports: { rest: number; auth: number; storage: number; realtime: number; functions: number }
}): string {
  const upstream = traefikUpstreamHost()
  const hostRule = `${opts.ref}.${opts.publicDomain}`
  const ref = opts.ref
  // Match Kong strip_path: clients call /rest/v1/*, /auth/v1/*, etc.; backends listen at /.
  const strip = (name: string, prefix: string) => `    tenant-${ref}-${name}-strip:
      stripPrefix:
        prefixes:
          - "${prefix}"
`
  return `# Generated by Studio — per-project routing (REST, Auth, Storage, Realtime, Functions)
http:
  middlewares:
${strip('rest', '/rest/v1')}${strip('auth', '/auth/v1')}${strip('storage', '/storage/v1')}${strip('realtime', '/realtime/v1')}${strip('functions', '/functions/v1')}
  routers:
    tenant-${ref}-rest:
      rule: Host(\`${hostRule}\`) && PathPrefix(\`/rest/v1\`)
      middlewares:
        - tenant-${ref}-rest-strip
      service: tenant-${ref}-rest
      entryPoints: [web, websecure]
    tenant-${ref}-auth:
      rule: Host(\`${hostRule}\`) && PathPrefix(\`/auth/v1\`)
      middlewares:
        - tenant-${ref}-auth-strip
      service: tenant-${ref}-auth
      entryPoints: [web, websecure]
    tenant-${ref}-storage:
      rule: Host(\`${hostRule}\`) && PathPrefix(\`/storage/v1\`)
      middlewares:
        - tenant-${ref}-storage-strip
      service: tenant-${ref}-storage
      entryPoints: [web, websecure]
    tenant-${ref}-realtime:
      rule: Host(\`${hostRule}\`) && PathPrefix(\`/realtime/v1\`)
      middlewares:
        - tenant-${ref}-realtime-strip
      service: tenant-${ref}-realtime
      entryPoints: [web, websecure]
    tenant-${ref}-functions:
      rule: Host(\`${hostRule}\`) && PathPrefix(\`/functions/v1\`)
      middlewares:
        - tenant-${ref}-functions-strip
      service: tenant-${ref}-functions
      entryPoints: [web, websecure]

  services:
    tenant-${opts.ref}-rest:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.rest}" }]
        passHostHeader: true
    tenant-${opts.ref}-auth:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.auth}" }]
        passHostHeader: true
    tenant-${opts.ref}-storage:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.storage}" }]
        passHostHeader: true
    tenant-${opts.ref}-realtime:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.realtime}" }]
        passHostHeader: true
    tenant-${opts.ref}-functions:
      loadBalancer:
        servers: [{ url: "http://${upstream}:${opts.ports.functions}" }]
        passHostHeader: true
`
}

export async function getTenantStackArtifacts({
  claims,
  ref,
  publicDomain,
}: {
  claims: Claims
  ref: string
  publicDomain: string
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const row = await executeQuery<{
    id: number
    ref: string
    data_plane_port_base: number | null
    connection_string: string | null
    connection_string_enc: string | null
    jwt_secret_enc: string | null
    service_key: string
    anon_key: string
    service_key_enc: string | null
    anon_key_enc: string | null
    data_plane_last_provisioned_at: string | null
    data_plane_last_provision_result: unknown | null
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.data_plane_port_base,
        p.connection_string,
        p.connection_string_enc,
        p.jwt_secret_enc,
        p.service_key,
        p.anon_key,
        p.service_key_enc,
        p.anon_key_enc,
        p.data_plane_last_provisioned_at,
        p.data_plane_last_provision_result
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  const rows = row.data ?? []
  if (rows.length === 0) return null

  const p = rows[0]!
  const jwtSecret = resolveProjectJwtSecret(p.jwt_secret_enc)

  const connectionStringEnc = (p.connection_string_enc ?? '').trim()
  const tenantDbUrl = connectionStringEnc.length > 0 ? decryptString(connectionStringEnc) : p.connection_string

  if (!tenantDbUrl?.trim()) {
    return null
  }

  const anonKeyEnc = (p.anon_key_enc ?? '').trim()
  const anonKey = anonKeyEnc.length > 0 ? decryptString(anonKeyEnc) : p.anon_key
  const serviceKeyEnc = (p.service_key_enc ?? '').trim()
  const serviceKey = serviceKeyEnc.length > 0 ? decryptString(serviceKeyEnc) : p.service_key

  let base = p.data_plane_port_base ?? 0
  if (!Number.isFinite(base) || base < 1024) {
    base = computeDataPlanePortBase(p.ref)
    const persist = await executeQuery({
      query: `
        update saas.projects p
        set data_plane_port_base = $1
        from saas.organization_members m
        where p.id = $2
          and m.organization_id = p.organization_id
          and m.gotrue_id = $3
      `,
      parameters: [base, p.id, gotrueId],
      actorId: gotrueId,
    })
    if (persist.error) throw persist.error
  }

  const domain = (publicDomain || resolvePublicDomainForTenantStack()).trim() || 'localhost'
  const tls = domain !== 'localhost' && domain !== '127.0.0.1'
  const origin = `${tls ? 'https' : 'http'}://${p.ref}.${domain}`
  const embedPooler = process.env.SAAS_TENANT_EMBED_SUPAVISOR === 'true'
  const ports: {
    rest: number
    auth: number
    storage: number
    realtime: number
    functions: number
    pooler?: number
  } = {
    rest: base + 1,
    auth: base + 2,
    storage: base + 3,
    realtime: base + 4,
    functions: base + 5,
  }
  if (embedPooler) {
    ports.pooler = base + 6
  }

  const normalizedTenantUrl = tenantDbUrl.trim().replace(/^postgres:\/\//, 'postgresql://')
  const dbUrl = new URL(normalizedTenantUrl)
  const tenantConnPass = dbUrl.password ? decodeURIComponent(dbUrl.password) : ''
  const auxDbPass =
    process.env.SAAS_DATA_PLANE_AUX_ROLE_PASSWORD?.trim() || tenantConnPass || ''

  const restDbUri = postgresUrlWithDbRole(normalizedTenantUrl, 'authenticator', auxDbPass)
  const authDbUri = postgresUrlWithDbRole(normalizedTenantUrl, 'supabase_auth_admin', auxDbPass)
  const storageDbUri = postgresUrlWithDbRole(
    normalizedTenantUrl,
    'supabase_storage_admin',
    auxDbPass
  )

  const realtimeSecretKeyBase = Buffer.concat([
    crypto.createHmac('sha384', jwtSecret).update(`rt:skb1:${p.ref}`).digest(),
    crypto.createHmac('sha384', jwtSecret).update(`rt:skb2:${p.ref}`).digest(),
  ])
    .toString('base64')
    .slice(0, 128)
  // Realtime AES-128-ECB requires exactly 16 bytes (not 24 hex chars).
  const realtimeDbEncKey = crypto
    .createHmac('sha256', jwtSecret)
    .update(`rt:dbenc:${p.ref}`)
    .digest('hex')
    .slice(0, 16)

  const adminMetaJdbc = postgresUrlWithDbRole(normalizedTenantUrl, 'supabase_admin', auxDbPass)
  const poolerCompose =
    embedPooler && ports.pooler != null
      ? {
          ectoMetadataUrl: postgresJdbcUrlToEcto(adminMetaJdbc),
          exsBody: buildTenantSupavisorPoolerExs({
            ref: p.ref,
            dbHost: dbUrl.hostname,
            dbPort: dbUrl.port || '5432',
            dbName: dbUrl.pathname.replace(/^\//, '') || 'postgres',
          }),
          secretKeyBase: crypto.createHmac('sha512', jwtSecret).update(`pool:skb:${p.ref}`).digest('base64'),
          vaultEncKey: crypto.createHash('sha256').update(`${jwtSecret}:vault:${p.ref}`).digest('hex').slice(0, 32),
          auxDbPassword: auxDbPass,
        }
      : null

  const dockerComposeYml = repairKnownTenantComposeYaml(
    buildSlimTenantDockerCompose({
    ref: p.ref,
    ports: {
      rest: ports.rest,
      auth: ports.auth,
      storage: ports.storage,
      realtime: ports.realtime,
      functions: ports.functions,
      ...(ports.pooler != null ? { pooler: ports.pooler } : {}),
    },
    restDbUri,
    authDbUri,
    storageDbUri,
    jwtSecret,
    anonKey,
    serviceKey,
    apiExternalUrl: origin,
    siteUrl: origin,
    uriAllowList: origin,
    realtime: {
      dbHost: dbUrl.hostname,
      dbPort: dbUrl.port || '5432',
      dbName: dbUrl.pathname.replace(/^\//, ''),
      dbUser: 'supabase_admin',
      dbPassword: auxDbPass,
      secretKeyBase: realtimeSecretKeyBase,
      dbEncKey: realtimeDbEncKey,
    },
    pooler: poolerCompose,
    })
  )
  assertValidTenantComposeYaml(dockerComposeYml)

  const traefikYml = buildSlimTenantTraefikYml({
    ref: p.ref,
    publicDomain: domain,
    ports: {
      rest: ports.rest,
      auth: ports.auth,
      storage: ports.storage,
      realtime: ports.realtime,
      functions: ports.functions,
    },
  })

  const poolerHostEnv = process.env.SAAS_TENANT_POOLER_HOST?.trim()
  const tenant_pooler = poolerHostEnv
    ? { host: poolerHostEnv, port: parseInt(process.env.SAAS_TENANT_POOLER_PORT || '6543', 10) }
    : embedPooler
      ? { host: `${p.ref}.${domain}`, port: 6543 }
      : null

  return {
    project_ref: p.ref,
    public_domain: domain,
    tenant_api_url: origin,
    tenant_pooler,
    data_plane_port_base: base,
    data_plane_last_provisioned_at: p.data_plane_last_provisioned_at,
    data_plane_last_provision_result: p.data_plane_last_provision_result,
    ports,
    docker_compose_yml: dockerComposeYml,
    traefik_yml: traefikYml,
  }
}

export async function recordDataPlaneProvisionSuccess({
  claims,
  ref,
  provisionResult,
}: {
  claims: Claims
  ref: string
  provisionResult: Record<string, unknown>
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const r = await executeQuery({
    query: `
      update saas.projects p
      set
        data_plane_last_provisioned_at = now(),
        data_plane_last_provision_result = $1::jsonb
      from saas.organization_members m
      where p.ref = $2
        and m.organization_id = p.organization_id
        and m.gotrue_id = $3
        and m.role in ('owner', 'admin', 'developer')
    `,
    parameters: [JSON.stringify(provisionResult), ref, gotrueId],
    actorId: gotrueId,
  })
  if (r.error) throw r.error
}

export async function recordDataPlaneProvisionFailure({
  claims,
  ref,
  error,
  reason,
}: {
  claims: Claims
  ref: string
  error: unknown
  reason?: string
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const message = error instanceof Error ? error.message : String(error)
  const r = await executeQuery({
    query: `
      update saas.projects p
      set data_plane_last_provision_result = $1::jsonb
      from saas.organization_members m
      where p.ref = $2
        and m.organization_id = p.organization_id
        and m.gotrue_id = $3
        and m.role in ('owner', 'admin', 'developer')
    `,
    parameters: [
      JSON.stringify({
        ok: false,
        reason: reason ?? 'provision_failed',
        error: message.slice(0, 500),
        at: new Date().toISOString(),
      }),
      ref,
      gotrueId,
    ],
    actorId: gotrueId,
  })
  if (r.error) throw r.error
}

export async function updateProject({
  claims,
  ref,
  updates,
}: {
  claims: Claims
  ref: string
  updates: { name?: string | null; connection_string?: string | null }
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const setParts: string[] = []
  const parameters: unknown[] = []
  let i = 1
  const isUpdatingConnectionString = 'connection_string' in updates

  if ('name' in updates) {
    setParts.push(`name = coalesce($${i++}, p.name)`)
    parameters.push(updates.name ?? null)
  }
  if ('connection_string' in updates) {
    const raw = updates.connection_string
    const normalized =
      raw == null || (typeof raw === 'string' && raw.trim() === '') ? null : String(raw).trim()
    // Encrypted-at-rest storage: stop writing plaintext.
    setParts.push(`connection_string = null`)
    setParts.push(`connection_string_enc = $${i++}`)
    parameters.push(normalized ? encryptString(normalized) : null)
  }

  if (!setParts.length) {
    const current = await executeQuery<{ id: number; ref: string; name: string }>({
      query: `
        select p.id, p.ref, p.name
        from saas.projects p
        join saas.organization_members m on m.organization_id = p.organization_id
        where m.gotrue_id = $1 and p.ref = $2
        limit 1
      `,
      parameters: [gotrueId, ref],
      actorId: gotrueId,
    })
    if (current.error) throw current.error
    if (!current.data?.length) return null
    const p = current.data[0]
    return { id: p.id, ref: p.ref, name: p.name }
  }

  const access = await executeQuery<{ organization_id: number }>({
    query: `
      select p.organization_id
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where m.gotrue_id = $1 and p.ref = $2
      limit 1
    `,
    parameters: [gotrueId, ref],
    actorId: gotrueId,
  })
  if (access.error) throw access.error
  if (!access.data?.length) return null
  await assertOrganizationNotPlatformSuspendedById(access.data[0].organization_id, gotrueId)

  const ownerIdx = i++
  const refIdx = i++
  parameters.push(gotrueId, ref)

  const updated = await executeQuery<{
    id: number
    ref: string
    name: string
  }>({
    query: `
      update saas.projects p
      set ${setParts.join(', ')}
      where exists (
        select 1
        from saas.organization_members m
        where m.organization_id = p.organization_id
          and m.gotrue_id = $${ownerIdx}
          and m.role in (${isUpdatingConnectionString ? "'owner','admin'" : "'owner','admin','developer'"})
      )
        and p.ref = $${refIdx}
      returning p.id, p.ref, p.name
    `,
    parameters,
    actorId: gotrueId,
  })

  if (updated.error) throw updated.error
  if (!updated.data?.length) return null

  const p = updated.data[0]
  return { id: p.id, ref: p.ref, name: p.name }
}

export async function deleteProject({ claims, ref }: { claims: Claims; ref: string }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const deleted = await executeQuery<{
    id: number
    name: string
    ref: string
    organization_id: number
  }>({
    query: `
      delete from saas.projects p
      where exists (
        select 1
        from saas.organization_members m
        where m.organization_id = p.organization_id
          and m.gotrue_id = $1
          and m.role in ('owner','admin')
      )
        and p.ref = $2
      returning p.id, p.name, p.ref, p.organization_id
    `,
    parameters: [gotrueId, ref],
    actorId: gotrueId,
  })

  if (deleted.error) throw deleted.error
  const row = deleted.data?.[0]

  if (row) {
    await recordAuditLog({
      claims,
      organizationId: row.organization_id,
      projectRef: row.ref,
      action: 'project.delete',
      targetType: 'project',
      targetDescription: `Project "${row.name}" (${row.ref})`,
      metadata: { project_id: row.id },
    })
  }

  return row ?? null
}

export async function listOrganizationProjects({
  claims,
  slug,
  limit,
  offset,
  statuses,
  search,
}: {
  claims: Claims
  slug: string
  limit?: number
  offset?: number
  statuses?: string[] | undefined
  search?: string | undefined
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const qLimit = Math.min(Math.max(limit ?? 100, 1), 200)
  const qOffset = Math.max(offset ?? 0, 0)
  const qSearch = search?.trim()

  // Minimal filtering: ignore `statuses` for now (frontend uses it, but it isn't essential for CRUD).
  const baseWhere = `o.slug = $1 and m.gotrue_id = $2 and p.is_branch = false`

  const countParams: any[] = [slug, gotrueId]
  const countWhere = qSearch
    ? `${baseWhere} and (p.name ilike '%' || $3 || '%' or p.ref ilike '%' || $3 || '%')`
    : baseWhere
  if (qSearch) countParams.push(qSearch)

  const count = await executeQuery<{ count: string }>({
    query: `
      select count(*)::text as count
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      join saas.organization_members m on m.organization_id = o.id
      where ${countWhere}
    `,
    parameters: countParams,
    actorId: gotrueId,
  })
  if (count.error) throw count.error

  const params: any[] = [...countParams, qLimit, qOffset]
  // Parameter indices for limit/offset depend on whether `$3` exists.
  const limitIndex = qSearch ? 4 : 3
  const offsetIndex = qSearch ? 5 : 4

  const projects = await executeQuery<{
    id: number
    ref: string
    name: string
    organization_id: number
    organization_slug: string
    cloud_provider: string
    region: string
    status: string
    inserted_at: string | null
    is_branch: boolean
    preview_branch_refs: string[]
    has_dedicated_database: boolean
    data_plane_last_provisioned_at: string | null
    data_plane_last_provision_ok: string | null
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.name,
        p.organization_id,
        p.organization_slug,
        p.cloud_provider,
        p.region,
        p.status,
        p.inserted_at,
        p.is_branch,
        p.preview_branch_refs,
        (coalesce(trim(p.connection_string_enc), '') <> '' or coalesce(trim(p.connection_string), '') <> '') as has_dedicated_database,
        p.data_plane_last_provisioned_at,
        (p.data_plane_last_provision_result->>'ok') as data_plane_last_provision_ok
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      join saas.organization_members m on m.organization_id = o.id
      where ${countWhere}
      order by p.name asc
      limit $${limitIndex} offset $${offsetIndex}
    `,
    parameters: params,
    actorId: gotrueId,
  })
  if (projects.error) throw projects.error

  return {
    pagination: {
      count: parseInt(count.data?.[0]?.count ?? '0', 10),
      limit: qLimit,
      offset: qOffset,
    },
    projects: (projects.data ?? []).map((p) => ({
      cloud_provider: p.cloud_provider,
      databases: [
        {
          cloud_provider: p.cloud_provider,
          identifier: p.ref,
          region: p.region,
          status: p.status as any,
          type: 'PRIMARY',
        },
      ],
      inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : new Date(0).toISOString(),
      is_branch: p.is_branch,
      name: p.name,
      ref: p.ref,
      region: p.region,
      status: p.status as any,
      has_dedicated_database: p.has_dedicated_database,
      data_plane_last_provisioned_at: p.data_plane_last_provisioned_at
        ? new Date(p.data_plane_last_provisioned_at).toISOString()
        : null,
      data_plane_last_provision_ok:
        p.data_plane_last_provision_ok === 'true'
          ? true
          : p.data_plane_last_provision_ok === 'false'
            ? false
            : null,
    })),
  }
}
