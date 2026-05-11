import { components } from 'api-types'
import { PROJECT_ENDPOINT, PROJECT_ENDPOINT_PROTOCOL } from 'lib/constants/api'
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
