const PUBLIC_URL = new URL(process.env.SUPABASE_PUBLIC_URL || 'http://localhost:8000')

/** Base Logflare origin (no path/query). Strips misconfigured ingestion URLs. */
export function getLogflareBaseUrl(): string | undefined {
  const raw = process.env.LOGFLARE_URL?.trim()
  if (!raw) return undefined

  try {
    const url = new URL(raw)
    return `${url.protocol}//${url.host}`
  } catch {
    return raw.split('?')[0]?.replace(/\/+$/, '') || undefined
  }
}

// Use LOGFLARE_URL until analytics/v1/ routing is supported
export const PROJECT_ANALYTICS_URL = getLogflareBaseUrl()
  ? `${getLogflareBaseUrl()}/api/`
  : undefined

export const PROJECT_REST_URL = `${PUBLIC_URL.origin}/rest/v1/`
export const PROJECT_ENDPOINT = PUBLIC_URL.host
export const PROJECT_ENDPOINT_PROTOCOL = PUBLIC_URL.protocol.replace(':', '')

/** Placeholder project ref for local mocks only (not a routable legacy `/project/default` slug). */
export const DEFAULT_PROJECT = {
  id: 1,
  ref: 'abcdefghijklmnopqrst',
  name: process.env.DEFAULT_PROJECT_NAME || 'Default Project',
  organization_id: 1,
  cloud_provider: 'localhost',
  status: 'ACTIVE_HEALTHY',
  region: 'local',
  inserted_at: '2021-08-02T06:40:40.646Z',
}
