import type { AnalyticsResult } from './logs'

const USAGE_ANALYTICS_ENDPOINTS = new Set([
  'usage.api-counts',
  'usage.api-requests-count',
])

export function isUsageAnalyticsEndpoint(name: string): boolean {
  return USAGE_ANALYTICS_ENDPOINTS.has(name)
}

/** Studio chart keys → Logflare `@interval` values. */
const INTERVAL_PARAM_MAP: Record<string, string> = {
  '1hr': 'hourly',
  '1day': 'hourly',
  '7day': 'daily',
  hourly: 'hourly',
  daily: 'daily',
  minutely: 'minutely',
}

export function mapAnalyticsQueryParams(
  params: Record<string, string | undefined>
): Record<string, string | undefined> {
  const interval = params.interval
  if (!interval) return params

  const mapped = INTERVAL_PARAM_MAP[interval] ?? interval
  if (mapped === interval) return params

  return { ...params, interval: mapped }
}

export function emptyUsageAnalyticsResult(): AnalyticsResult {
  return { result: [] }
}

/** Logflare-shaped empty payload for observability endpoints when analytics is not configured. */
export function emptyAnalyticsResult(name?: string): AnalyticsResult {
  if (name === 'auth.metrics') {
    return { result: [], error: null }
  }
  return { result: [] }
}

export function isAnalyticsConfigured(): boolean {
  return Boolean(process.env.LOGFLARE_PRIVATE_ACCESS_TOKEN && process.env.LOGFLARE_URL?.trim())
}

export function hasAnalyticsPayloadError(data: AnalyticsResult | undefined): boolean {
  if (!data?.error) return false
  if (typeof data.error === 'string') return true
  return Boolean(data.error.message)
}
