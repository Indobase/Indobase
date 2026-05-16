import type { components } from 'api-types'
import type { JwtPayload } from 'indobase-js'
import type { NextApiRequest } from 'next'
import crypto from 'node:crypto'

import { makeRandomString } from 'lib/helpers'
import { PROJECT_REST_URL } from 'lib/constants/api'

import { encryptString } from './util'
import { executeQuery } from './query'
import {
  computeBranchSchemaDiffSql,
  copyParentTenantIntoBranch,
  getProjectTenantDatabaseUrl,
  parseIncludedSchemas,
  resetBranchDatabaseFromParent,
  tenantPgMetaHeaders,
} from './branch-tenant-db'
import { applyAndTrackMigrations } from './migrations'
import {
  ensureSaasTables,
  finalizeDedicatedProjectProvisioning,
  getGotrueUserId,
  type Claims,
} from './platform'

type BranchResponse = components['schemas']['BranchResponse']
type CreateBranchBody = components['schemas']['CreateBranchBody']

type ProjectRow = {
  id: number
  ref: string
  name: string
  organization_id: number
  organization_slug: string
  cloud_provider: string
  region: string
  status: string
  inserted_at: string
  updated_at: string | null
  is_branch: boolean
  parent_project_ref: string | null
  preview_branch_refs: string[]
  preview_branching_enabled: boolean
  branch_uuid: string
  branch_name: string | null
  git_branch: string | null
  branch_persistent: boolean
  branch_with_data: boolean
}

function branchStatusForProject(status: string): BranchResponse['status'] {
  if (status === 'PROVISIONING' || status === 'COMING_UP') return 'CREATING_PROJECT'
  return 'MIGRATIONS_PASSED'
}

function previewStatusForProject(status: string): BranchResponse['preview_project_status'] {
  const allowed: BranchResponse['preview_project_status'][] = [
    'INACTIVE',
    'ACTIVE_HEALTHY',
    'ACTIVE_UNHEALTHY',
    'COMING_UP',
    'UNKNOWN',
    'GOING_DOWN',
    'INIT_FAILED',
    'REMOVED',
    'RESTORING',
    'UPGRADING',
    'PAUSING',
    'RESTORE_FAILED',
    'RESTARTING',
    'PAUSE_FAILED',
    'RESIZING',
  ]
  return (allowed.includes(status as any) ? status : 'ACTIVE_HEALTHY') as BranchResponse['preview_project_status']
}

function rowToBranchResponse(row: ProjectRow, parentRef: string): BranchResponse {
  const now = new Date().toISOString()
  const inserted = row.inserted_at ? new Date(row.inserted_at).toISOString() : now
  const updated = row.updated_at ? new Date(row.updated_at).toISOString() : inserted
  return {
    id: row.branch_uuid,
    name: row.branch_name ?? row.name,
    project_ref: row.ref,
    parent_project_ref: parentRef,
    is_default: false,
    persistent: row.branch_persistent,
    with_data: row.branch_with_data,
    git_branch: row.git_branch ?? undefined,
    status: branchStatusForProject(row.status),
    preview_project_status: previewStatusForProject(row.status),
    created_at: inserted,
    updated_at: updated,
  }
}

function mainBranchResponse(parent: ProjectRow): BranchResponse {
  const now = new Date().toISOString()
  const inserted = parent.inserted_at ? new Date(parent.inserted_at).toISOString() : now
  return {
    id: parent.branch_uuid,
    name: 'main',
    project_ref: parent.ref,
    parent_project_ref: parent.ref,
    is_default: true,
    persistent: true,
    with_data: true,
    status: 'MIGRATIONS_PASSED',
    preview_project_status: previewStatusForProject(parent.status),
    created_at: inserted,
    updated_at: inserted,
  }
}

async function loadParentProject({
  claims,
  parentRef,
}: {
  claims: Claims
  parentRef: string
}): Promise<ProjectRow | null> {
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<ProjectRow>({
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
        p.inserted_at::text as inserted_at,
        p.inserted_at::text as updated_at,
        p.is_branch,
        p.parent_project_ref,
        p.preview_branch_refs,
        coalesce(p.preview_branching_enabled, false) as preview_branching_enabled,
        coalesce(p.branch_uuid, gen_random_uuid())::text as branch_uuid,
        p.branch_name,
        p.git_branch,
        coalesce(p.branch_persistent, false) as branch_persistent,
        coalesce(p.branch_with_data, false) as branch_with_data
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer')
      limit 1
    `,
    parameters: [parentRef, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data?.[0] ?? null
}

async function loadBranchProject({
  claims,
  branchRef,
}: {
  claims: Claims
  branchRef: string
}): Promise<(ProjectRow & { parent: ProjectRow }) | null> {
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<ProjectRow>({
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
        p.inserted_at::text as inserted_at,
        p.inserted_at::text as updated_at,
        p.is_branch,
        p.parent_project_ref,
        p.preview_branch_refs,
        coalesce(p.preview_branching_enabled, false) as preview_branching_enabled,
        coalesce(p.branch_uuid, gen_random_uuid())::text as branch_uuid,
        p.branch_name,
        p.git_branch,
        coalesce(p.branch_persistent, false) as branch_persistent,
        coalesce(p.branch_with_data, false) as branch_with_data
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where (p.ref = $1 or p.branch_uuid::text = $1)
        and p.is_branch = true
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer')
      limit 1
    `,
    parameters: [branchRef, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const branch = rows.data?.[0]
  if (!branch?.parent_project_ref) return null
  const parent = await loadParentProject({ claims, parentRef: branch.parent_project_ref })
  if (!parent) return null
  return { ...branch, parent }
}

function uniqueBranchRef(branchName: string) {
  const clean = branchName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20)
  const suffix = makeRandomString(8).toLowerCase()
  return `${clean || 'branch'}-${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

export async function listProjectBranches({
  claims,
  parentRef,
}: {
  claims: JwtPayload
  parentRef: string
}): Promise<BranchResponse[]> {
  await ensureSaasTables()
  const parent = await loadParentProject({ claims: claims as Claims, parentRef })
  if (!parent) throw new Error('Project not found')
  if (parent.is_branch) throw new Error('Branches can only be listed for a parent project')

  const gotrueId = getGotrueUserId(claims as Claims)
  const children = await executeQuery<ProjectRow>({
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
        p.inserted_at::text as inserted_at,
        p.inserted_at::text as updated_at,
        p.is_branch,
        p.parent_project_ref,
        p.preview_branch_refs,
        coalesce(p.preview_branching_enabled, false) as preview_branching_enabled,
        coalesce(p.branch_uuid, gen_random_uuid())::text as branch_uuid,
        p.branch_name,
        p.git_branch,
        coalesce(p.branch_persistent, false) as branch_persistent,
        coalesce(p.branch_with_data, false) as branch_with_data
      from saas.projects p
      where p.parent_project_ref = $1
        and p.is_branch = true
      order by p.inserted_at asc
    `,
    parameters: [parentRef],
    actorId: gotrueId,
  })
  if (children.error) throw children.error

  return [mainBranchResponse(parent), ...(children.data ?? []).map((c) => rowToBranchResponse(c, parentRef))]
}

export async function createProjectBranch({
  claims,
  parentRef,
  body,
}: {
  claims: JwtPayload
  parentRef: string
  body: CreateBranchBody
}): Promise<BranchResponse> {
  await ensureSaasTables()
  const parent = await loadParentProject({ claims: claims as Claims, parentRef })
  if (!parent) throw new Error('Project not found')
  if (parent.is_branch) throw new Error('Cannot create a branch from another branch')

  const branchName = body.branch_name?.trim()
  if (!branchName) throw new Error('branch_name is required')

  const gotrueId = getGotrueUserId(claims as Claims)
  const existing = await executeQuery<{ ref: string }>({
    query: `
      select ref from saas.projects
      where parent_project_ref = $1 and lower(branch_name) = lower($2)
      limit 1
    `,
    parameters: [parentRef, branchName],
    actorId: gotrueId,
  })
  if (existing.error) throw existing.error
  if (existing.data?.length) {
    throw new Error('A branch with this name already exists')
  }

  const childRef = uniqueBranchRef(branchName)
  const branchUuid = crypto.randomUUID()

  const { makeProjectJwt, resolveProjectJwtSecret } = await import('./project-jwt')
  const secret = resolveProjectJwtSecret(null)
  const anonKey = makeProjectJwt(secret, 'anon', childRef)
  const serviceKey = makeProjectJwt(secret, 'service_role', childRef)
  const dbPass = makeRandomString(24)

  const inserted = await executeQuery<ProjectRow>({
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
        db_pass_enc,
        is_branch,
        parent_project_ref,
        branch_uuid,
        branch_name,
        git_branch,
        branch_persistent,
        branch_with_data,
        preview_branching_enabled
      ) values (
        $1, $2, $3, $4, $5, $6, 'PROVISIONING',
        '', '', $7, $8,
        '',
        $9, '127.0.0.1', null, null, $10,
        true, $11, $12::uuid, $13, $14, $15, $16, false
      )
      returning
        id,
        ref,
        name,
        organization_id,
        organization_slug,
        cloud_provider,
        region,
        status,
        inserted_at::text as inserted_at,
        inserted_at::text as updated_at,
        is_branch,
        parent_project_ref,
        preview_branch_refs,
        preview_branching_enabled,
        branch_uuid::text as branch_uuid,
        branch_name,
        git_branch,
        branch_persistent,
        branch_with_data
    `,
    parameters: [
      parent.organization_id,
      parent.organization_slug,
      childRef,
      branchName,
      parent.cloud_provider,
      body.region?.trim() || parent.region,
      encryptString(serviceKey),
      encryptString(anonKey),
      PROJECT_REST_URL,
      encryptString(dbPass),
      parentRef,
      branchUuid,
      branchName,
      body.git_branch?.trim() || null,
      Boolean(body.persistent),
      Boolean(body.with_data),
    ],
    actorId: gotrueId,
  })
  if (inserted.error || !inserted.data?.length) {
    throw inserted.error ?? new Error('Failed to create branch project')
  }

  const child = inserted.data[0]!

  try {
    await finalizeDedicatedProjectProvisioning({
      projectRef: child.ref,
      gotrueId,
      deleteOnFailure: true,
      userDbPass: dbPass,
    })
  } catch (err) {
    throw err
  }

  if (body.with_data) {
    const parentUrl = await getProjectTenantDatabaseUrl({
      claims: claims as Claims,
      ref: parentRef,
    })
    const branchUrl = await getProjectTenantDatabaseUrl({
      claims: claims as Claims,
      ref: child.ref,
    })
    if (parentUrl && branchUrl) {
      const copy = await copyParentTenantIntoBranch({
        parentUrl,
        branchUrl,
        schemas: [...parseIncludedSchemas()],
        includeData: true,
      })
      if (!copy.ok) {
        console.warn(
          '[saas] branch with_data copy from parent failed for %s (method=%s)',
          child.ref,
          copy.method
        )
      }
    } else {
      console.warn(
        '[saas] branch with_data requested for %s but tenant DB URLs are unavailable',
        child.ref
      )
    }
  }

  const enableParent = await executeQuery({
    query: `
      update saas.projects
      set preview_branching_enabled = true,
          preview_branch_refs = array_append(
            coalesce(preview_branch_refs, '{}'::text[]),
            $2
          ),
          branch_uuid = coalesce(branch_uuid, $3::uuid)
      where ref = $1
        and not ($2 = any(coalesce(preview_branch_refs, '{}'::text[])))
    `,
    parameters: [parentRef, childRef, parent.branch_uuid || crypto.randomUUID()],
    actorId: gotrueId,
  })
  if (enableParent.error) throw enableParent.error

  const refreshed = await loadBranchProject({ claims: claims as Claims, branchRef: child.ref })
  if (!refreshed) throw new Error('Failed to load created branch')
  return rowToBranchResponse(refreshed, parentRef)
}

export async function getProjectBranchByName({
  claims,
  parentRef,
  name,
}: {
  claims: JwtPayload
  parentRef: string
  name: string
}): Promise<BranchResponse | null> {
  if (name === 'main') {
    const parent = await loadParentProject({ claims: claims as Claims, parentRef })
    return parent ? mainBranchResponse(parent) : null
  }
  const branches = await listProjectBranches({ claims, parentRef })
  return branches.find((b) => b.name === name) ?? null
}

export async function getBranchByRef({
  claims,
  branchRef,
}: {
  claims: JwtPayload
  branchRef: string
}): Promise<BranchResponse | null> {
  const loaded = await loadBranchProject({ claims: claims as Claims, branchRef })
  if (!loaded) {
    const parent = await loadParentProject({ claims: claims as Claims, parentRef: branchRef })
    if (parent && !parent.is_branch) return mainBranchResponse(parent)
    return null
  }
  return rowToBranchResponse(loaded, loaded.parent_project_ref!)
}

export async function updateBranchByRef({
  claims,
  branchRef,
  body,
}: {
  claims: JwtPayload
  branchRef: string
  body: {
    branch_name?: string
    git_branch?: string
    persistent?: boolean
    request_review?: boolean
  }
}): Promise<{ message: 'ok'; workflow_run_id: string }> {
  const loaded = await loadBranchProject({ claims: claims as Claims, branchRef })
  if (!loaded) throw new Error('Branch not found')

  const gotrueId = getGotrueUserId(claims as Claims)
  const resolvedRef = loaded.ref

  if (body.branch_name?.trim()) {
    const updated = await executeQuery({
      query: `
        update saas.projects p
        set branch_name = $1, name = $1
        where p.ref = $2
          and p.is_branch = true
          and exists (
            select 1 from saas.organization_members m
            where m.organization_id = p.organization_id
              and m.gotrue_id = $3
              and m.role in ('owner', 'admin', 'developer')
          )
      `,
      parameters: [body.branch_name.trim(), resolvedRef, gotrueId],
      actorId: gotrueId,
    })
    if (updated.error) throw updated.error
  }
  if (body.git_branch !== undefined) {
    const updated = await executeQuery({
      query: `
        update saas.projects p
        set git_branch = $1
        where p.ref = $2 and p.is_branch = true
          and exists (
            select 1 from saas.organization_members m
            where m.organization_id = p.organization_id
              and m.gotrue_id = $3
              and m.role in ('owner', 'admin', 'developer')
          )
      `,
      parameters: [body.git_branch?.trim() || null, resolvedRef, gotrueId],
      actorId: gotrueId,
    })
    if (updated.error) throw updated.error
  }
  if (body.persistent !== undefined) {
    const updated = await executeQuery({
      query: `
        update saas.projects p
        set branch_persistent = $1
        where p.ref = $2 and p.is_branch = true
          and exists (
            select 1 from saas.organization_members m
            where m.organization_id = p.organization_id
              and m.gotrue_id = $3
              and m.role in ('owner', 'admin', 'developer')
          )
      `,
      parameters: [Boolean(body.persistent), resolvedRef, gotrueId],
      actorId: gotrueId,
    })
    if (updated.error) throw updated.error
  }

  return { message: 'ok', workflow_run_id: crypto.randomUUID() }
}

export async function deleteBranchByRef({
  claims,
  branchRef,
}: {
  claims: JwtPayload
  branchRef: string
}): Promise<void> {
  const loaded = await loadBranchProject({ claims: claims as Claims, branchRef })
  if (!loaded) throw new Error('Branch not found')

  const gotrueId = getGotrueUserId(claims as Claims)
  const parentRef = loaded.parent_project_ref!

  const deleted = await executeQuery({
    query: `
      delete from saas.projects p
      where p.ref = $1
        and p.is_branch = true
        and exists (
          select 1 from saas.organization_members m
          where m.organization_id = p.organization_id
            and m.gotrue_id = $2
            and m.role in ('owner', 'admin')
        )
    `,
    parameters: [branchRef, gotrueId],
    actorId: gotrueId,
  })
  if (deleted.error) throw deleted.error

  await executeQuery({
    query: `
      update saas.projects
      set preview_branch_refs = array_remove(coalesce(preview_branch_refs, '{}'::text[]), $2)
      where ref = $1
    `,
    parameters: [parentRef, branchRef],
    actorId: gotrueId,
  })
}

export async function disablePreviewBranching({
  claims,
  parentRef,
}: {
  claims: JwtPayload
  parentRef: string
}): Promise<void> {
  const gotrueId = getGotrueUserId(claims as Claims)
  const updated = await executeQuery({
    query: `
      update saas.projects p
      set preview_branching_enabled = false
      where p.ref = $1
        and p.is_branch = false
        and exists (
          select 1 from saas.organization_members m
          where m.organization_id = p.organization_id
            and m.gotrue_id = $2
            and m.role in ('owner', 'admin')
        )
    `,
    parameters: [parentRef, gotrueId],
    actorId: gotrueId,
  })
  if (updated.error) throw updated.error
}

async function requireBranchWithParent({
  claims,
  branchRef,
}: {
  claims: JwtPayload
  branchRef: string
}) {
  const loaded = await loadBranchProject({ claims: claims as Claims, branchRef })
  if (!loaded) throw new Error('Branch not found')
  return loaded
}

export async function getBranchSchemaDiff({
  claims,
  branchRef,
  includedSchemas,
}: {
  claims: JwtPayload
  branchRef: string
  includedSchemas?: string | string[]
}): Promise<string> {
  const loaded = await requireBranchWithParent({ claims, branchRef })
  const parentRef = loaded.parent_project_ref!
  const schemas = parseIncludedSchemas(includedSchemas)

  const parentUrl = await getProjectTenantDatabaseUrl({ claims: claims as Claims, ref: parentRef })
  const branchUrl = await getProjectTenantDatabaseUrl({ claims: claims as Claims, ref: loaded.ref })
  if (!parentUrl || !branchUrl) return ''

  try {
    return await computeBranchSchemaDiffSql({ parentUrl, branchUrl, schemas })
  } catch (e) {
    console.warn('[saas] branch diff failed for %s: %O', loaded.ref, e)
    return ''
  }
}

export async function mergeBranchByRef({
  claims,
  branchRef,
  migration_version,
}: {
  claims: JwtPayload
  branchRef: string
  migration_version?: string
}): Promise<{ message: 'ok'; workflow_run_id: string }> {
  const loaded = await requireBranchWithParent({ claims, branchRef })
  const parentRef = loaded.parent_project_ref!
  const gotrueId = getGotrueUserId(claims as Claims)

  const parentUrl = await getProjectTenantDatabaseUrl({ claims: claims as Claims, ref: parentRef })
  const branchUrl = await getProjectTenantDatabaseUrl({ claims: claims as Claims, ref: loaded.ref })

  let diffSql = ''
  if (parentUrl && branchUrl) {
    try {
      diffSql = await computeBranchSchemaDiffSql({
        parentUrl,
        branchUrl,
        schemas: [...parseIncludedSchemas()],
      })
    } catch (e) {
      console.warn('[saas] merge diff for %s failed: %O', loaded.ref, e)
    }
  }

  if (diffSql.trim()) {
    const headers = tenantPgMetaHeaders(parentUrl!)
    const migrationName =
      migration_version?.trim() || `branch_merge_${new Date().toISOString().replace(/[:.]/g, '-')}`
    const applied = await applyAndTrackMigrations({
      query: diffSql,
      name: migrationName,
      headers,
    })
    if (applied.error) throw applied.error
  }

  const workflowRunId = crypto.randomUUID()

  await executeQuery({
    query: `
      update saas.projects p
      set status = 'ACTIVE_HEALTHY'
      where p.ref = $1 and p.is_branch = true
    `,
    parameters: [loaded.ref],
    actorId: gotrueId,
  })

  return { message: 'ok', workflow_run_id: workflowRunId }
}

/**
 * Sync branch tenant DB from parent (schema refresh). Does not modify parent/production.
 */
export async function pushBranchByRef({
  claims,
  branchRef,
}: {
  claims: JwtPayload
  branchRef: string
}): Promise<{ message: 'ok'; workflow_run_id: string }> {
  const loaded = await requireBranchWithParent({ claims, branchRef })
  const parentRef = loaded.parent_project_ref!

  const parentUrl = await getProjectTenantDatabaseUrl({ claims: claims as Claims, ref: parentRef })
  const branchUrl = await getProjectTenantDatabaseUrl({ claims: claims as Claims, ref: loaded.ref })
  if (!parentUrl || !branchUrl) {
    throw new Error('Dedicated tenant databases are required to push branch updates')
  }

  const copy = await copyParentTenantIntoBranch({
    parentUrl,
    branchUrl,
    schemas: [...parseIncludedSchemas()],
    includeData: Boolean(loaded.branch_with_data),
  })
  if (!copy.ok) {
    throw new Error('Failed to sync branch database from parent')
  }

  return { message: 'ok', workflow_run_id: crypto.randomUUID() }
}

/** Drop branch user schema objects and recopy schema from parent (no data). */
export async function resetBranchByRef({
  claims,
  branchRef,
}: {
  claims: JwtPayload
  branchRef: string
}): Promise<{ message: 'ok'; workflow_run_id: string }> {
  const loaded = await requireBranchWithParent({ claims, branchRef })
  const parentRef = loaded.parent_project_ref!

  const parentUrl = await getProjectTenantDatabaseUrl({ claims: claims as Claims, ref: parentRef })
  const branchUrl = await getProjectTenantDatabaseUrl({ claims: claims as Claims, ref: loaded.ref })
  if (!parentUrl || !branchUrl) {
    throw new Error('Dedicated tenant databases are required to reset a branch')
  }

  await resetBranchDatabaseFromParent({
    parentUrl,
    branchUrl,
    schemas: [...parseIncludedSchemas()],
  })

  const gotrueId = getGotrueUserId(claims as Claims)
  await executeQuery({
    query: `
      update saas.projects
      set status = 'ACTIVE_HEALTHY'
      where ref = $1 and is_branch = true
    `,
    parameters: [loaded.ref],
    actorId: gotrueId,
  })

  return { message: 'ok', workflow_run_id: crypto.randomUUID() }
}

/** Mark a paused/inactive branch project as healthy again (control-plane status only). */
export async function restoreBranchByRef({
  claims,
  branchRef,
}: {
  claims: JwtPayload
  branchRef: string
}): Promise<{ message: 'Branch restoration initiated' }> {
  const loaded = await requireBranchWithParent({ claims, branchRef })
  const gotrueId = getGotrueUserId(claims as Claims)

  const updated = await executeQuery({
    query: `
      update saas.projects p
      set status = 'ACTIVE_HEALTHY'
      where p.ref = $1
        and p.is_branch = true
        and exists (
          select 1 from saas.organization_members m
          where m.organization_id = p.organization_id
            and m.gotrue_id = $2
            and m.role in ('owner', 'admin', 'developer')
        )
    `,
    parameters: [loaded.ref, gotrueId],
    actorId: gotrueId,
  })
  if (updated.error) throw updated.error

  return { message: 'Branch restoration initiated' }
}

const branchingBase = process.env.BRANCHING_PLATFORM_API_URL?.replace(/\/$/, '')

/** Forward to external branching platform when configured. */
export async function proxyBranchPlatformRequest(
  req: NextApiRequest,
  branchIdOrRef: string,
  suffix: string
): Promise<{ status: number; headers: Headers; body: string } | null> {
  if (!branchingBase) return null

  const search = req.url?.includes('?') ? `?${req.url.split('?')[1]}` : ''
  const target = `${branchingBase}/v1/branches/${encodeURIComponent(branchIdOrRef)}${suffix}${search}`
  const headers = new Headers()
  const auth = req.headers.authorization
  if (typeof auth === 'string') headers.set('authorization', auth)
  if (suffix === '/diff') {
    headers.set('accept', 'text/plain')
  } else {
    headers.set('accept', 'application/json')
  }
  if (req.method && !['GET', 'HEAD'].includes(req.method)) {
    headers.set('content-type', 'application/json')
  }
  const body =
    req.method && ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {})
  const upstream = await fetch(target, { method: req.method, headers, body })
  return { status: upstream.status, headers: upstream.headers, body: await upstream.text() }
}

export function isBranchingEnabledForProject(project: {
  is_branch: boolean
  preview_branching_enabled?: boolean
  preview_branch_refs?: string[]
}): boolean {
  if (project.is_branch) return false
  return Boolean(
    project.preview_branching_enabled ||
      (project.preview_branch_refs?.length ?? 0) > 0
  )
}
