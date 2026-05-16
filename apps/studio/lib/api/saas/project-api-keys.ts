import { createHash } from 'crypto'
import type { JwtPayload } from 'indobase-js'

import { recordAuditLog } from './audit'
import { loadProjectJwtSecretEncForMember, makeProjectJwt, resolveProjectJwtSecret } from './project-jwt'
import { executeQuery } from './query'
import { decryptString, encryptString } from './util'

type Claims = JwtPayload & Record<string, any>

export type ApiKeyType = 'publishable' | 'secret' | 'legacy'

export type ApiKeyResponse = {
  api_key?: string | null
  description?: string | null
  hash?: string | null
  id?: string | null
  inserted_at?: string | null
  name: string
  prefix?: string | null
  secret_jwt_template?: { [key: string]: unknown } | null
  type?: ApiKeyType | null
  updated_at?: string | null
}

type ApiKeyRow = {
  id: string
  project_ref: string
  name: string
  description: string | null
  type: 'publishable' | 'secret'
  key_hash: string
  key_prefix: string
  api_key_enc: string
  secret_jwt_template: Record<string, unknown> | null
  inserted_at: string
  updated_at: string
}

type ProjectKeysRow = {
  anon_key: string
  service_key: string
  anon_key_enc: string | null
  service_key_enc: string | null
  legacy_api_keys_enabled: boolean
}

function getActor(claims: Claims | undefined) {
  if (!claims) throw new Error('Missing claims')
  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const id =
    (normalized?.sub as string | undefined) ??
    (normalized?.id as string | undefined) ??
    (normalized?.user_id as string | undefined)
  if (!id) throw new Error('Missing user session')
  return { id }
}

async function assertProjectMembership(
  projectRef: string,
  gotrueId: string,
  requiredRoles: Array<'owner' | 'admin' | 'developer' | 'viewer'> = [
    'owner',
    'admin',
    'developer',
    'viewer',
  ]
) {
  const row = await executeQuery<{ id: number }>({
    query: `
      select p.id
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2 and m.role = any($3::text[])
      limit 1
    `,
    parameters: [projectRef, gotrueId, requiredRoles as unknown as string[]],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) throw new Error('Project not found or insufficient permissions')
}

async function loadProjectKeys(projectRef: string, gotrueId: string) {
  const row = await executeQuery<ProjectKeysRow>({
    query: `
      select
        p.anon_key,
        p.service_key,
        p.anon_key_enc,
        p.service_key_enc,
        coalesce(p.legacy_api_keys_enabled, true) as legacy_api_keys_enabled
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [projectRef, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) throw new Error('Project not found')
  return row.data[0]
}

function decryptProjectKey(plain: string, enc: string | null) {
  if (enc?.trim()) return decryptString(enc)
  return plain
}

/** Issue a JWT that works with PostgREST / GoTrue on the tenant data plane. */
async function generateProjectApiKey(opts: {
  type: 'publishable' | 'secret'
  projectRef: string
  gotrueId: string
  name: string
}) {
  const encRow = await loadProjectJwtSecretEncForMember({
    projectRef: opts.projectRef,
    gotrueId: opts.gotrueId,
  })
  if (!encRow) throw new Error('Project not found')
  const jwtSecret = resolveProjectJwtSecret(encRow.jwtSecretEnc)
  const role = opts.type === 'publishable' ? 'anon' : 'service_role'
  const apiKey = makeProjectJwt(jwtSecret, role, opts.projectRef, {
    api_key_name: opts.name,
  })
  const keyPrefix = apiKey.slice(0, Math.min(apiKey.length, 20))
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  return { apiKey, keyPrefix, keyHash }
}

function maskApiKey(apiKey: string, keyPrefix: string) {
  const head = keyPrefix || apiKey.slice(0, 15)
  return `${head}${'•'.repeat(Math.max(8, apiKey.length - head.length))}`
}

function mapRow(row: ApiKeyRow, reveal: boolean): ApiKeyResponse {
  const apiKey = decryptString(row.api_key_enc)
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    hash: row.key_hash,
    prefix: row.key_prefix,
    secret_jwt_template: row.secret_jwt_template,
    inserted_at: row.inserted_at,
    updated_at: row.updated_at,
    api_key: reveal ? apiKey : maskApiKey(apiKey, row.key_prefix),
  }
}

function assertApiKeyName(name: string) {
  const trimmed = name.trim()
  if (!/^[a-z_][a-z0-9_]*$/.test(trimmed)) {
    throw new Error(
      'Name must start with a letter or underscore and contain only lowercase letters, numbers, and underscores'
    )
  }
  return trimmed
}

export async function listProjectApiKeys({
  claims,
  ref,
  reveal = false,
}: {
  claims: Claims
  ref: string
  reveal?: boolean
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)

  const project = await loadProjectKeys(ref, gotrueId)
  const anon = decryptProjectKey(project.anon_key, project.anon_key_enc)
  const service = decryptProjectKey(project.service_key, project.service_key_enc)

  const legacy: ApiKeyResponse[] = []
  if (project.legacy_api_keys_enabled) {
    legacy.push(
      {
        id: 'anon',
        name: 'anon',
        type: 'legacy',
        description: 'Legacy anon API key',
        hash: '',
        prefix: '',
        api_key: reveal ? anon : maskApiKey(anon, anon.slice(0, 12)),
      },
      {
        id: 'service_role',
        name: 'service_role',
        type: 'legacy',
        description: 'Legacy service_role API key',
        hash: '',
        prefix: '',
        api_key: reveal ? service : maskApiKey(service, service.slice(0, 12)),
      }
    )
  }

  const rows = await executeQuery<ApiKeyRow>({
    query: `
      select
        id::text as id,
        project_ref,
        name,
        description,
        type,
        key_hash,
        key_prefix,
        api_key_enc,
        secret_jwt_template,
        inserted_at,
        updated_at
      from saas.project_api_keys
      where project_ref = $1
      order by inserted_at asc
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error

  const modern = (rows.data ?? []).map((row) => mapRow(row, reveal))
  return [...legacy, ...modern]
}

export async function createProjectApiKey({
  claims,
  ref,
  body,
  reveal = false,
}: {
  claims: Claims
  ref: string
  body: {
    name: string
    description?: string | null
    type: 'publishable' | 'secret'
    secret_jwt_template?: { [key: string]: unknown } | null
  }
  reveal?: boolean
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId, ['owner', 'admin', 'developer'])

  const name = assertApiKeyName(body.name)
  const type = body.type
  if (type !== 'publishable' && type !== 'secret') {
    throw new Error('type must be publishable or secret')
  }

  const { apiKey, keyHash, keyPrefix } = await generateProjectApiKey({
    type,
    projectRef: ref,
    gotrueId,
    name,
  })
  const secretTemplate =
    type === 'secret'
      ? (body.secret_jwt_template ?? { role: 'service_role' })
      : (body.secret_jwt_template ?? null)

  const inserted = await executeQuery<ApiKeyRow>({
    query: `
      insert into saas.project_api_keys (
        project_ref,
        name,
        description,
        type,
        key_hash,
        key_prefix,
        api_key_enc,
        secret_jwt_template
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      returning
        id::text as id,
        project_ref,
        name,
        description,
        type,
        key_hash,
        key_prefix,
        api_key_enc,
        secret_jwt_template,
        inserted_at,
        updated_at
    `,
    parameters: [
      ref,
      name,
      body.description?.trim() || null,
      type,
      keyHash,
      keyPrefix,
      encryptString(apiKey),
      secretTemplate ? JSON.stringify(secretTemplate) : null,
    ],
    actorId: gotrueId,
  })

  if (inserted.error) {
    if (inserted.error.message?.includes('unique')) {
      throw new Error('An API key with this name already exists')
    }
    throw inserted.error
  }
  if (!inserted.data?.length) throw new Error('Failed to create API key')

  const row = inserted.data[0]
  await recordAuditLog({
    claims,
    projectRef: ref,
    action: 'project.api_key.rotated',
    targetType: 'api_key',
    targetDescription: `${type}:${name}`,
    metadata: { id: row.id, type, name },
  })

  return mapRow(row, reveal || true)
}

export async function getProjectApiKeyById({
  claims,
  ref,
  id,
  reveal = false,
}: {
  claims: Claims
  ref: string
  id: string
  reveal?: boolean
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)

  if (id === 'anon' || id === 'service_role') {
    const project = await loadProjectKeys(ref, gotrueId)
    if (!project.legacy_api_keys_enabled) throw new Error('API key not found')
    const plain =
      id === 'anon'
        ? decryptProjectKey(project.anon_key, project.anon_key_enc)
        : decryptProjectKey(project.service_key, project.service_key_enc)
    return {
      id,
      name: id,
      type: 'legacy' as const,
      description: `Legacy ${id} API key`,
      hash: '',
      prefix: '',
      api_key: reveal ? plain : maskApiKey(plain, plain.slice(0, 12)),
    }
  }

  const row = await executeQuery<ApiKeyRow>({
    query: `
      select
        id::text as id,
        project_ref,
        name,
        description,
        type,
        key_hash,
        key_prefix,
        api_key_enc,
        secret_jwt_template,
        inserted_at,
        updated_at
      from saas.project_api_keys
      where project_ref = $1 and id::text = $2
      limit 1
    `,
    parameters: [ref, id],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) throw new Error('API key not found')
  return mapRow(row.data[0], reveal)
}

export async function updateProjectApiKeyById({
  claims,
  ref,
  id,
  body,
  reveal = false,
}: {
  claims: Claims
  ref: string
  id: string
  body: { description?: string | null }
  reveal?: boolean
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId, ['owner', 'admin', 'developer'])

  if (id === 'anon' || id === 'service_role') {
    throw new Error('Legacy API keys cannot be updated here')
  }

  const updated = await executeQuery<ApiKeyRow>({
    query: `
      update saas.project_api_keys
      set
        description = coalesce($3, description),
        updated_at = now()
      where project_ref = $1 and id::text = $2
      returning
        id::text as id,
        project_ref,
        name,
        description,
        type,
        key_hash,
        key_prefix,
        api_key_enc,
        secret_jwt_template,
        inserted_at,
        updated_at
    `,
    parameters: [ref, id, body.description?.trim() || null],
    actorId: gotrueId,
  })
  if (updated.error) throw updated.error
  if (!updated.data?.length) throw new Error('API key not found')
  return mapRow(updated.data[0], reveal)
}

export async function deleteProjectApiKeyById({
  claims,
  ref,
  id,
}: {
  claims: Claims
  ref: string
  id: string
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId, ['owner', 'admin', 'developer'])

  if (id === 'anon' || id === 'service_role') {
    throw new Error('Legacy API keys cannot be deleted here')
  }

  const removed = await executeQuery<{ id: string; name: string; type: string }>({
    query: `
      delete from saas.project_api_keys
      where project_ref = $1 and id::text = $2
      returning id::text as id, name, type
    `,
    parameters: [ref, id],
    actorId: gotrueId,
  })
  if (removed.error) throw removed.error
  if (!removed.data?.length) return false

  await recordAuditLog({
    claims,
    projectRef: ref,
    action: 'project.api_key.rotated',
    targetType: 'api_key',
    targetDescription: `deleted:${removed.data[0].name}`,
    metadata: removed.data[0],
  })
  return true
}

export async function getLegacyApiKeysStatus({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId)
  const project = await loadProjectKeys(ref, gotrueId)
  return { enabled: project.legacy_api_keys_enabled }
}

export async function setLegacyApiKeysEnabled({
  claims,
  ref,
  enabled,
}: {
  claims: Claims
  ref: string
  enabled: boolean
}) {
  const { id: gotrueId } = getActor(claims)
  await assertProjectMembership(ref, gotrueId, ['owner', 'admin'])

  const updated = await executeQuery<{ legacy_api_keys_enabled: boolean }>({
    query: `
      update saas.projects p
      set legacy_api_keys_enabled = $3
      from saas.organization_members m
      where p.ref = $1
        and m.organization_id = p.organization_id
        and m.gotrue_id = $2
      returning coalesce(p.legacy_api_keys_enabled, true) as legacy_api_keys_enabled
    `,
    parameters: [ref, gotrueId, enabled],
    actorId: gotrueId,
  })
  if (updated.error) throw updated.error
  if (!updated.data?.length) throw new Error('Project not found')
  return { enabled: updated.data[0].legacy_api_keys_enabled }
}

export function parseRevealQuery(value: unknown) {
  if (typeof value === 'string') return value === 'true'
  return false
}
