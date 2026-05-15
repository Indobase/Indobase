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

export function hasAnalyticsPayloadError(data: AnalyticsResult | undefined): boolean {
  if (!data?.error) return false
  if (typeof data.error === 'string') return true
  return Boolean(data.error.message)
}
