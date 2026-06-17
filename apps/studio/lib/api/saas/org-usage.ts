import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { components } from 'api-types'

import { executeQuery } from './query'
import { getGotrueUserId } from './platform'

type Claims = JwtPayload & Record<string, any>

export type OrgUsageApiResponse = components['schemas']['OrgUsageResponse'] & {
  /** False when Vector has not written saas.usage_events for this org yet. */
  metering_available: boolean
}

type OrgUsageQuery = {
  projectRef?: string | null
  start?: string
  end?: string
}

async function hasUsageEventsTable(): Promise<boolean> {
  const result = await executeQuery<{ ok: boolean }>({
    query: `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'saas' and table_name = 'usage_events'
      ) as ok
    `,
    parameters: [],
  })
  if (result.error) return false
  return Boolean(result.data?.[0]?.ok)
}

function parseIsoDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function emptyUsageResponse(usageBillingEnabled: boolean): OrgUsageApiResponse {
  return {
    usage_billing_enabled: usageBillingEnabled,
    usages: [],
    metering_available: false,
  }
}

function buildEgressUsageRow(opts: {
  totalBytes: number
  projects: Array<{ ref: string; name: string; bytes: number }>
}): OrgUsageApiResponse['usages'][number] {
  const gb = opts.totalBytes / (1024 * 1024 * 1024)
  return {
    metric: 'EGRESS',
    available_in_plan: true,
    capped: false,
    cost: 0,
    pricing_strategy: 'NONE',
    unlimited: true,
    usage: gb,
    usage_original: gb,
    unit_price_desc: 'GB',
    project_allocations: opts.projects.map((p) => ({
      ref: p.ref,
      name: p.name,
      usage: p.bytes / (1024 * 1024 * 1024),
    })),
  }
}

/**
 * Org usage for billing UI. Reads Kong access logs aggregated in saas.usage_events when
 * Vector metering is configured; otherwise returns metering_available=false so the UI can hide charts.
 */
export async function getOrganizationUsage({
  claims,
  slug,
  query,
}: {
  claims: Claims
  slug: string
  query?: OrgUsageQuery
}): Promise<OrgUsageApiResponse> {
  const gotrueId = getGotrueUserId(claims)

  const orgResult = await executeQuery<{ id: number; usage_billing_enabled: boolean }>({
    query: `
      select o.id, o.usage_billing_enabled
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
  if (!org) {
    throw new Error('Organization not found')
  }

  if (!(await hasUsageEventsTable())) {
    return emptyUsageResponse(org.usage_billing_enabled)
  }

  const end = parseIsoDate(query?.end, new Date())
  const start = parseIsoDate(query?.start, new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000))
  const projectRef = query?.projectRef?.trim() || null

  const params: Array<string | number> = [org.id, start.toISOString(), end.toISOString()]
  let projectFilter = ''
  if (projectRef) {
    params.push(projectRef)
    projectFilter = `and p.ref = $${params.length}`
  }

  const hasEvents = await executeQuery<{ count: string }>({
    query: `
      select count(*)::text as count
      from saas.usage_events ue
      join saas.projects p on p.ref = ue.project_ref
      where p.organization_id = $1
        and ue.occurred_at >= $2::timestamptz
        and ue.occurred_at <= $3::timestamptz
        ${projectFilter}
      limit 1
    `,
    parameters: params,
    actorId: gotrueId,
  })
  if (hasEvents.error) throw hasEvents.error

  const eventCount = parseInt(hasEvents.data?.[0]?.count ?? '0', 10)
  if (eventCount === 0) {
    return emptyUsageResponse(org.usage_billing_enabled)
  }

  const byProject = await executeQuery<{ ref: string; name: string; bytes: string }>({
    query: `
      select p.ref, p.name, coalesce(sum(ue.bytes_sent), 0)::text as bytes
      from saas.usage_events ue
      join saas.projects p on p.ref = ue.project_ref
      where p.organization_id = $1
        and ue.occurred_at >= $2::timestamptz
        and ue.occurred_at <= $3::timestamptz
        ${projectFilter}
      group by p.ref, p.name
      order by bytes desc
    `,
    parameters: params,
    actorId: gotrueId,
  })
  if (byProject.error) throw byProject.error

  const projects = (byProject.data ?? []).map((row) => ({
    ref: row.ref,
    name: row.name,
    bytes: parseInt(row.bytes, 10) || 0,
  }))
  const totalBytes = projects.reduce((sum, p) => sum + p.bytes, 0)

  return {
    usage_billing_enabled: org.usage_billing_enabled,
    metering_available: true,
    usages: [buildEgressUsageRow({ totalBytes, projects })],
  }
}
