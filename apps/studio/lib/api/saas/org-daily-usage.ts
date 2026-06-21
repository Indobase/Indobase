import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { components } from 'api-types'

import { PricingMetric } from 'data/analytics/org-daily-stats-query'

import { getGotrueUserId } from './platform'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, any>
type OrgDailyUsageResponse = components['schemas']['OrgDailyUsageResponse']

type OrgDailyUsageQuery = {
  projectRef?: string | null
  start?: string
  end?: string
}

function parseIsoDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function emptyDailyUsage(): OrgDailyUsageResponse {
  return { usages: [] }
}

async function hasUsageEventsTable(): Promise<boolean> {
  const result = await executeQuery<{ ok: boolean }>({
    query: `
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'saas' and table_name = 'usage_events'
      ) as ok
    `,
    parameters: [],
  })
  if (result.error) return false
  return Boolean(result.data?.[0]?.ok)
}

async function hasUsageDailyMetricsTable(): Promise<boolean> {
  const result = await executeQuery<{ ok: boolean }>({
    query: `
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'saas' and table_name = 'usage_daily_metrics'
      ) as ok
    `,
    parameters: [],
  })
  if (result.error) return false
  return Boolean(result.data?.[0]?.ok)
}

function buildEgressBreakdown(row: {
  egress_rest: string
  egress_auth: string
  egress_storage: string
  egress_realtime: string
  egress_function: string
}): OrgDailyUsageResponse['usages'][number]['breakdown'] {
  return {
    egress_rest: parseInt(row.egress_rest, 10) || 0,
    egress_auth: parseInt(row.egress_auth, 10) || 0,
    egress_storage: parseInt(row.egress_storage, 10) || 0,
    egress_realtime: parseInt(row.egress_realtime, 10) || 0,
    egress_function: parseInt(row.egress_function, 10) || 0,
    egress_graphql: 0,
    egress_logdrain: 0,
    egress_supavisor: 0,
  }
}

/**
 * Daily org usage for billing charts (egress, database size, storage size).
 * Reads Vector-ingested Kong events and usage-collect snapshots in saas.*.
 */
export async function getOrganizationDailyUsage({
  claims,
  slug,
  query,
}: {
  claims: Claims
  slug: string
  query?: OrgDailyUsageQuery
}): Promise<OrgDailyUsageResponse> {
  const gotrueId = getGotrueUserId(claims)

  const orgResult = await executeQuery<{ id: number }>({
    query: `
      select o.id
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (orgResult.error) throw orgResult.error
  const org = orgResult.data?.[0]
  if (!org) throw new Error('Organization not found')

  const end = parseIsoDate(query?.end, new Date())
  const start = parseIsoDate(query?.start, new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000))
  const projectRef = query?.projectRef?.trim() || null

  const params: Array<string | number> = [org.id, formatDay(start), formatDay(end)]
  let projectFilter = ''
  if (projectRef) {
    params.push(projectRef)
    projectFilter = `and p.ref = $${params.length}`
  }

  const usages: OrgDailyUsageResponse['usages'] = []

  if (await hasUsageEventsTable()) {
    const egressRows = await executeQuery<{
      day: string
      bytes: string
      egress_rest: string
      egress_auth: string
      egress_storage: string
      egress_realtime: string
      egress_function: string
    }>({
      query: `
        select
          date_trunc('day', ue.occurred_at)::date::text as day,
          coalesce(sum(ue.bytes_sent), 0)::text as bytes,
          coalesce(sum(case when ue.path like '/rest/%' or ue.path like '/rest/v1/%' then ue.bytes_sent else 0 end), 0)::text as egress_rest,
          coalesce(sum(case when ue.path like '/auth/%' or ue.path like '/auth/v1/%' then ue.bytes_sent else 0 end), 0)::text as egress_auth,
          coalesce(sum(case when ue.path like '/storage/%' or ue.path like '/storage/v1/%' then ue.bytes_sent else 0 end), 0)::text as egress_storage,
          coalesce(sum(case when ue.path like '/realtime/%' or ue.path like '/realtime/v1/%' then ue.bytes_sent else 0 end), 0)::text as egress_realtime,
          coalesce(sum(case when ue.path like '/functions/%' or ue.path like '/functions/v1/%' then ue.bytes_sent else 0 end), 0)::text as egress_function
        from saas.usage_events ue
        join saas.projects p on p.ref = ue.project_ref
        where p.organization_id = $1
          and ue.occurred_at >= $2::date
          and ue.occurred_at < ($3::date + interval '1 day')
          ${projectFilter}
        group by 1
        order by 1
      `,
      parameters: params,
      actorId: gotrueId,
    })
    if (egressRows.error) throw egressRows.error

    for (const row of egressRows.data ?? []) {
      const bytes = parseInt(row.bytes, 10) || 0
      usages.push({
        date: row.day,
        metric: PricingMetric.EGRESS,
        usage: bytes / (1024 * 1024 * 1024),
        usage_original: bytes,
        breakdown: buildEgressBreakdown(row),
      })
    }
  }

  if (await hasUsageDailyMetricsTable()) {
    const metricRows = await executeQuery<{
      day: string
      metric: string
      value_bytes: string
    }>({
      query: `
        select
          udm.day::text as day,
          udm.metric,
          udm.value_bytes::text as value_bytes
        from saas.usage_daily_metrics udm
        join saas.projects p on p.ref = udm.project_ref
        where p.organization_id = $1
          and udm.day >= $2::date
          and udm.day <= $3::date
          ${projectFilter}
        order by udm.day, udm.metric
      `,
      parameters: params,
      actorId: gotrueId,
    })
    if (metricRows.error) throw metricRows.error

    const byDayMetric = new Map<string, number>()
    for (const row of metricRows.data ?? []) {
      const key = `${row.day}:${row.metric}`
      byDayMetric.set(key, (byDayMetric.get(key) ?? 0) + (parseInt(row.value_bytes, 10) || 0))
    }

    for (const [key, bytes] of byDayMetric.entries()) {
      const [day, metric] = key.split(':')
      if (metric !== PricingMetric.DATABASE_SIZE && metric !== PricingMetric.STORAGE_SIZE) continue
      usages.push({
        date: day,
        metric: metric as typeof PricingMetric.DATABASE_SIZE | typeof PricingMetric.STORAGE_SIZE,
        usage: bytes,
        usage_original: bytes,
        breakdown: null,
      })
    }
  }

  if (usages.length === 0) return emptyDailyUsage()
  return { usages }
}
