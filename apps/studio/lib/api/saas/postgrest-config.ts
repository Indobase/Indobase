import type { components } from 'api-types'
import type { JwtPayload } from '@indobaseinc/indobase-js'

import { executeQuery } from './query'
import { resolveEncryptedPgMetaConnectionForProject } from './project-connection'
import { loadProjectJwtSecretEncForMember, resolveProjectJwtSecret } from './project-jwt'
import { getGotrueUserId } from './platform'

export const DEFAULT_POSTGREST_DB_SCHEMA = 'public, storage, graphql_public'

export type StoredPostgrestConfig = {
  db_schema?: string
  max_rows?: number
  db_extra_search_path?: string
  db_anon_role?: string
  role_claim_key?: string
  db_pool?: number | null
}

const TENANT_EXPOSED_SCHEMAS_SQL = `
  select string_agg(n.nspname, ', ' order by n.nspname) as db_schema
  from pg_namespace n
  where n.nspname not like 'pg\\_%'
    and n.nspname not in ('information_schema')
    and (
      has_schema_privilege('anon', n.oid, 'USAGE')
      or has_schema_privilege('authenticator', n.oid, 'USAGE')
    )
`

function parseStoredPostgrestConfig(raw: unknown): StoredPostgrestConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const out: StoredPostgrestConfig = {}
  if (typeof o.db_schema === 'string' && o.db_schema.trim()) out.db_schema = o.db_schema.trim()
  if (typeof o.max_rows === 'number' && Number.isFinite(o.max_rows)) out.max_rows = o.max_rows
  if (typeof o.db_extra_search_path === 'string') out.db_extra_search_path = o.db_extra_search_path
  if (typeof o.db_anon_role === 'string' && o.db_anon_role.trim()) out.db_anon_role = o.db_anon_role.trim()
  if (typeof o.role_claim_key === 'string' && o.role_claim_key.trim()) {
    out.role_claim_key = o.role_claim_key.trim()
  }
  if (o.db_pool === null) out.db_pool = null
  else if (typeof o.db_pool === 'number' && Number.isFinite(o.db_pool)) out.db_pool = o.db_pool
  return out
}

async function loadProjectPostgrestRow({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<{
  postgrest_config: unknown
  jwt_secret_enc: string | null
} | null> {
  const gotrueId = getGotrueUserId(claims)
  const row = await executeQuery<{
    postgrest_config: unknown
    jwt_secret_enc: string | null
  }>({
    query: `
      select p.postgrest_config, p.jwt_secret_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  return row.data?.[0] ?? null
}

async function resolveJwtSecretForProject({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<string> {
  const loaded = await loadProjectJwtSecretEncForMember({ projectRef: ref, gotrueId: getGotrueUserId(claims) })
  if (loaded?.jwtSecretEnc?.trim()) {
    return resolveProjectJwtSecret(loaded.jwtSecretEnc)
  }
  return process.env.AUTH_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'
}

/** Reads exposed schemas from the tenant DB when a dedicated connection exists. */
export async function resolveTenantExposedSchemas({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<string | null> {
  let connectionEncrypted: string
  try {
    connectionEncrypted = await resolveEncryptedPgMetaConnectionForProject({
      claims,
      ref,
      incomingEncrypted: null,
    })
  } catch {
    return null
  }

  const result = await executeQuery<{ db_schema: string | null }>({
    query: TENANT_EXPOSED_SCHEMAS_SQL,
    headers: { 'x-connection-encrypted': connectionEncrypted },
  })
  if (result.error) return null
  const value = result.data?.[0]?.db_schema?.trim()
  return value || null
}

export async function getProjectPostgrestConfig({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<components['schemas']['GetPostgrestConfigResponse'] | null> {
  const row = await loadProjectPostgrestRow({ claims, ref })
  if (!row) return null

  const stored = parseStoredPostgrestConfig(row.postgrest_config)
  const jwt_secret = row.jwt_secret_enc?.trim()
    ? resolveProjectJwtSecret(row.jwt_secret_enc)
    : await resolveJwtSecretForProject({ claims, ref })

  let db_schema = stored.db_schema
  if (!db_schema) {
    db_schema = (await resolveTenantExposedSchemas({ claims, ref })) ?? DEFAULT_POSTGREST_DB_SCHEMA
  }

  return {
    db_anon_role: stored.db_anon_role ?? 'anon',
    db_extra_search_path: stored.db_extra_search_path ?? 'public',
    db_schema,
    jwt_secret,
    max_rows: stored.max_rows ?? 100,
    role_claim_key: stored.role_claim_key ?? '.role',
  }
}

export async function updateProjectPostgrestConfig({
  claims,
  ref,
  patch,
}: {
  claims: JwtPayload
  ref: string
  patch: components['schemas']['UpdatePostgrestConfigBody']
}): Promise<components['schemas']['UpdatePostgrestConfigResponse'] | null> {
  const existing = await getProjectPostgrestConfig({ claims, ref })
  if (!existing) return null

  const gotrueId = getGotrueUserId(claims)
  const next: StoredPostgrestConfig = {
    db_schema: patch.db_schema ?? existing.db_schema,
    max_rows: patch.max_rows ?? existing.max_rows,
    db_extra_search_path: patch.db_extra_search_path ?? existing.db_extra_search_path,
    db_anon_role: existing.db_anon_role,
    role_claim_key: existing.role_claim_key,
    db_pool: patch.db_pool !== undefined ? patch.db_pool : null,
  }

  const saved = await executeQuery({
    query: `
      update saas.projects p
      set postgrest_config = $1::jsonb
      from saas.organization_members m
      where p.ref = $2
        and m.organization_id = p.organization_id
        and m.gotrue_id = $3
        and m.role in ('owner', 'admin', 'developer')
    `,
    parameters: [JSON.stringify(next), ref, gotrueId],
    actorId: gotrueId,
  })
  if (saved.error) throw saved.error

  return {
    db_schema: next.db_schema!,
    max_rows: next.max_rows!,
    db_extra_search_path: next.db_extra_search_path!,
    db_pool: next.db_pool ?? null,
  }
}

/** Comma-separated schema list for advisors/lints. */
export async function resolvePostgrestDbSchemaForProject({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<string> {
  const config = await getProjectPostgrestConfig({ claims, ref })
  return config?.db_schema ?? DEFAULT_POSTGREST_DB_SCHEMA
}
