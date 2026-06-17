import { components } from 'api-types'
import type { JwtPayload } from '@indobaseinc/indobase-js'
import { PROJECT_ENDPOINT, PROJECT_ENDPOINT_PROTOCOL } from 'lib/constants/api'
import { normalizeProjectApiKey, resolveProjectJwtSecret } from './project-jwt'
import { decryptString } from './util'
import { executeQuery } from './query'
import { ensureSaasTables, getGotrueUserId } from './platform'
import { resolveSaaSTenantRestUrls, usesTenantPublicApiHost } from './tenant-public-urls'
import { assertSaaSBackend } from './util'

type ProjectAppConfig = components['schemas']['ProjectSettingsResponse']['app_config'] & {
  protocol?: string
}

export type ProjectSettings = components['schemas']['ProjectSettingsResponse'] & {
  app_config?: ProjectAppConfig
}

/**
 * Gets SaaS project settings
 *
 * _Only call this from server-side SaaS code._
 */
export function getProjectSettings() {
  assertSaaSBackend()

  const response = {
    app_config: {
      db_schema: 'public',
      endpoint: PROJECT_ENDPOINT,
      storage_endpoint: PROJECT_ENDPOINT,
      // manually added to force the frontend to use the correct URL
      protocol: PROJECT_ENDPOINT_PROTOCOL,
    },
    cloud_provider: 'AWS',
    db_dns_name: '-',
    db_host: process.env.POSTGRES_HOST || 'localhost',
    db_ip_addr_config: 'legacy' as const,
    db_name: process.env.POSTGRES_DB || 'postgres',
    db_port: Number(process.env.POSTGRES_PORT) || 5432,
    db_user: process.env.POSTGRES_USER_READ_WRITE || process.env.POSTGRES_USER || 'postgres',
    inserted_at: '2021-08-02T06:40:40.646Z',
    // AUTH_JWT_SECRET must match GoTrue's JWT_SECRET. We intentionally do NOT
    // ship a literal fallback here — leaking a known secret to clients would
    // let anyone forge service-role tokens. If the env is unset, return empty
    // and let the UI surface a clear "JWT secret missing" state.
    jwt_secret: process.env.AUTH_JWT_SECRET || '',
    name: process.env.DEFAULT_PROJECT_NAME || 'Default Project',
    ref: 'abcdefghijklmnopqrst',
    region: 'ap-southeast-1',
    service_api_keys: [
      {
        api_key: process.env.SUPABASE_SERVICE_KEY ?? '',
        name: 'service_role key',
        tags: 'service_role',
      },
      {
        api_key: process.env.SUPABASE_ANON_KEY ?? '',
        name: 'anon key',
        tags: 'anon',
      },
    ],
    ssl_enforced: false,
    status: 'ACTIVE_HEALTHY',
  } satisfies ProjectSettings

  return response
}

/**
 * Per-project settings for Studio (API host, keys, DB connection metadata).
 */
export async function getProjectSettingsForRef({
  claims,
  ref,
}: {
  claims: JwtPayload
  ref: string
}): Promise<ProjectSettings | null> {
  assertSaaSBackend()
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims as JwtPayload & Record<string, unknown>)

  const row = await executeQuery<{
    ref: string
    name: string
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
    data_plane_last_provisioned_at: string | null
    jwt_secret_enc: string | null
  }>({
    query: `
      select
        p.ref,
        p.name,
        p.cloud_provider,
        p.region,
        p.status,
        p.inserted_at,
        p.service_key,
        p.anon_key,
        p.service_key_enc,
        p.anon_key_enc,
        p.connection_string,
        p.connection_string_enc,
        p.data_plane_last_provisioned_at,
        p.jwt_secret_enc
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
  const jwtSecret = resolveProjectJwtSecret(p.jwt_secret_enc)
  const serviceKeyRaw = p.service_key_enc?.trim() ? decryptString(p.service_key_enc) : p.service_key
  const anonKeyRaw = p.anon_key_enc?.trim() ? decryptString(p.anon_key_enc) : p.anon_key
  const serviceKey = normalizeProjectApiKey(serviceKeyRaw, jwtSecret, 'service_role', p.ref)
  const anonKey = normalizeProjectApiKey(anonKeyRaw, jwtSecret, 'anon', p.ref)

  const tenantDbUrl =
    p.connection_string_enc?.trim()
      ? decryptString(p.connection_string_enc)
      : p.connection_string
  const hasDedicated = Boolean(tenantDbUrl?.trim())
  const { endpointHost, protocol } = resolveSaaSTenantRestUrls(ref, usesTenantPublicApiHost(hasDedicated))

  const base = getProjectSettings()

  return {
    ...base,
    ref: p.ref,
    name: p.name,
    cloud_provider: p.cloud_provider,
    region: p.region,
    status: p.status,
    inserted_at: p.inserted_at ? new Date(p.inserted_at).toISOString() : base.inserted_at,
    jwt_secret: jwtSecret,
    app_config: {
      db_schema: 'public',
      endpoint: endpointHost,
      storage_endpoint: endpointHost,
      protocol,
    },
    service_api_keys: [
      {
        api_key: serviceKey,
        name: 'service_role key',
        tags: 'service_role',
      },
      {
        api_key: anonKey,
        name: 'anon key',
        tags: 'anon',
      },
    ],
  }
}
