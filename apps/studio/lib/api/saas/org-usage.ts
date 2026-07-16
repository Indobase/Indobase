import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { components } from 'api-types'

import { getIndobasePublicPlans, type IndobasePublicPlan } from './indobase-billing-plans'
import { executeQuery } from './query'
import { getGotrueUserId } from './platform'

type Claims = JwtPayload & Record<string, any>
type UsageRow = components['schemas']['OrgUsageResponse']['usages'][number]
type UsageMetric = UsageRow['metric']

export type OrgUsageApiResponse = components['schemas']['OrgUsageResponse'] & {
  /** False when neither saas.usage_events nor saas.usage_daily_metrics has data for this org yet. */
  metering_available: boolean
}

type OrgUsageQuery = {
  projectRef?: string | null
  start?: string
  end?: string
}

const GIB = 1024 * 1024 * 1024

/**
 * Per-metric rendering config. `bytes` metrics display as GB; `count` metrics display raw.
 * `planLimitKey` maps to `IndobasePublicPlan.limits`; when absent the metric is treated as
 * uncapped (e.g. EGRESS, which is enforced separately in quota-enforcement, not via plan limits).
 */
type MetricConfig = { kind: 'bytes' | 'count'; unitPriceDesc: string; planLimitKey?: string }

const METRIC_CONFIG: Partial<Record<UsageMetric, MetricConfig>> = {
  EGRESS: { kind: 'bytes', unitPriceDesc: 'GB' },
  DATABASE_SIZE: { kind: 'bytes', unitPriceDesc: 'GB', planLimitKey: 'database_size' },
  STORAGE_SIZE: { kind: 'bytes', unitPriceDesc: 'GB', planLimitKey: 'storage_size' },
  MONTHLY_ACTIVE_USERS: { kind: 'count', unitPriceDesc: 'MAU', planLimitKey: 'auth_maus' },
  FUNCTION_INVOCATIONS: {
    kind: 'count',
    unitPriceDesc: 'invocations',
    planLimitKey: 'functions_invocations',
  },
}

/** Daily-metrics `metric` values that map onto point-in-time usage rows. */
const DAILY_METRICS: UsageMetric[] = ['DATABASE_SIZE', 'STORAGE_SIZE', 'MONTHLY_ACTIVE_USERS']

export type OrgUsageMetricInput = {
  metric: UsageMetric
  /** Total in base units: bytes for `bytes` metrics, raw count for `count` metrics. */
  totalBase: number
  projects: Array<{ ref: string; name: string; base: number }>
}

/**
 * Pure builder for a single OrgUsageResponse row. Kept side-effect free so metric shaping and
 * plan-limit flags can be unit-tested without a database.
 */
export function buildOrgUsageRow(input: OrgUsageMetricInput, plan?: IndobasePublicPlan): UsageRow {
  const config = METRIC_CONFIG[input.metric] ?? { kind: 'count' as const, unitPriceDesc: '' }
  const toDisplay = (base: number) => (config.kind === 'bytes' ? base / GIB : base)

  let planLimitBase: number | undefined
  if (config.planLimitKey && plan?.limits) {
    const limit = plan.limits[config.planLimitKey]
    if (typeof limit === 'number') planLimitBase = limit
  }
  const usage = toDisplay(input.totalBase)

  return {
    metric: input.metric,
    available_in_plan: true,
    capped: false,
    cost: 0,
    pricing_strategy: 'NONE',
    unlimited: planLimitBase == null,
    usage,
    usage_original: usage,
    unit_price_desc: config.unitPriceDesc,
    project_allocations: input.projects
      .filter((p) => p.base > 0)
      .map((p) => ({ ref: p.ref, name: p.name, usage: toDisplay(p.base) })),
  }
}

/**
 * Pure assembly of an org usage response from normalized aggregates. Rows are emitted in a
 * stable order so the billing UI renders consistent metric cards.
 */
export function assembleOrgUsage(opts: {
  usageBillingEnabled: boolean
  plan?: IndobasePublicPlan
  /** Per-project egress + function-invocation totals from saas.usage_events (may be empty). */
  events?: Array<{ ref: string; name: string; bytes: number; fnInvocations: number }>
  eventsAvailable: boolean
  /** Latest daily snapshot per project/metric from saas.usage_daily_metrics (may be empty). */
  dailyLatest?: Array<{ ref: string; name: string; metric: string; value: number }>
}): OrgUsageApiResponse {
  const usages: UsageRow[] = []

  if (opts.eventsAvailable) {
    const events = opts.events ?? []
    usages.push(
      buildOrgUsageRow(
        {
          metric: 'EGRESS',
          totalBase: events.reduce((s, e) => s + e.bytes, 0),
          projects: events.map((e) => ({ ref: e.ref, name: e.name, base: e.bytes })),
        },
        opts.plan
      )
    )
    usages.push(
      buildOrgUsageRow(
        {
          metric: 'FUNCTION_INVOCATIONS',
          totalBase: events.reduce((s, e) => s + e.fnInvocations, 0),
          projects: events.map((e) => ({ ref: e.ref, name: e.name, base: e.fnInvocations })),
        },
        opts.plan
      )
    )
  }

  const daily = opts.dailyLatest ?? []
  for (const metric of DAILY_METRICS) {
    const rows = daily.filter((r) => r.metric === metric)
    if (rows.length === 0) continue
    usages.push(
      buildOrgUsageRow(
        {
          metric,
          totalBase: rows.reduce((s, r) => s + r.value, 0),
          projects: rows.map((r) => ({ ref: r.ref, name: r.name, base: r.value })),
        },
        opts.plan
      )
    )
  }

  return {
    usage_billing_enabled: opts.usageBillingEnabled,
    metering_available: usages.length > 0,
    usages,
  }
}

function parseIsoDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

async function hasTable(name: string): Promise<boolean> {
  const result = await executeQuery<{ ok: boolean }>({
    query: `
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'saas' and table_name = $1
      ) as ok
    `,
    parameters: [name],
  })
  if (result.error) return false
  return Boolean(result.data?.[0]?.ok)
}

function planForOrg(planId: string | null | undefined): IndobasePublicPlan | undefined {
  return getIndobasePublicPlans().find((p) => p.id === (planId || 'free'))
}

/**
 * Org usage for the billing UI. Surfaces egress + function invocations (from saas.usage_events)
 * and the latest database size, storage size, and monthly-active-user snapshots (from
 * saas.usage_daily_metrics). Returns metering_available=false when no metering data exists yet so
 * the UI can hide empty charts.
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

  const orgResult = await executeQuery<{
    id: number
    usage_billing_enabled: boolean
    plan: string | null
  }>({
    query: `
      select o.id, o.usage_billing_enabled, o.plan
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

  const plan = planForOrg(org.plan)
  const emptyResponse: OrgUsageApiResponse = {
    usage_billing_enabled: org.usage_billing_enabled,
    usages: [],
    metering_available: false,
  }

  const [eventsAvailable, dailyAvailable] = await Promise.all([
    hasTable('usage_events'),
    hasTable('usage_daily_metrics'),
  ])
  if (!eventsAvailable && !dailyAvailable) return emptyResponse

  const end = parseIsoDate(query?.end, new Date())
  const start = parseIsoDate(query?.start, new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000))
  const projectRef = query?.projectRef?.trim() || null

  const params: Array<string | number> = [org.id, start.toISOString(), end.toISOString()]
  let projectFilter = ''
  if (projectRef) {
    params.push(projectRef)
    projectFilter = `and p.ref = $${params.length}`
  }

  let events: Array<{ ref: string; name: string; bytes: number; fnInvocations: number }> = []
  if (eventsAvailable) {
    const rows = await executeQuery<{
      ref: string
      name: string
      bytes: string
      fn_invocations: string
    }>({
      query: `
        select
          p.ref,
          p.name,
          coalesce(sum(ue.bytes_sent), 0)::text as bytes,
          coalesce(sum(case when ue.path like '/functions/%' or ue.path like '/functions/v1/%' then 1 else 0 end), 0)::text as fn_invocations
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
    if (rows.error) throw rows.error
    events = (rows.data ?? []).map((r) => ({
      ref: r.ref,
      name: r.name,
      bytes: parseInt(r.bytes, 10) || 0,
      fnInvocations: parseInt(r.fn_invocations, 10) || 0,
    }))
  }

  let dailyLatest: Array<{ ref: string; name: string; metric: string; value: number }> = []
  if (dailyAvailable) {
    const dailyParams: Array<string | number> = [
      org.id,
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
    ]
    let dailyFilter = ''
    if (projectRef) {
      dailyParams.push(projectRef)
      dailyFilter = `and p.ref = $${dailyParams.length}`
    }
    const rows = await executeQuery<{
      ref: string
      name: string
      metric: string
      value_bytes: string
    }>({
      query: `
        select distinct on (p.ref, udm.metric)
          p.ref,
          p.name,
          udm.metric,
          udm.value_bytes::text as value_bytes
        from saas.usage_daily_metrics udm
        join saas.projects p on p.ref = udm.project_ref
        where p.organization_id = $1
          and udm.day >= $2::date
          and udm.day <= $3::date
          ${dailyFilter}
        order by p.ref, udm.metric, udm.day desc
      `,
      parameters: dailyParams,
      actorId: gotrueId,
    })
    if (rows.error) throw rows.error
    dailyLatest = (rows.data ?? []).map((r) => ({
      ref: r.ref,
      name: r.name,
      metric: r.metric,
      value: parseInt(r.value_bytes, 10) || 0,
    }))
  }

  return assembleOrgUsage({
    usageBillingEnabled: org.usage_billing_enabled,
    plan,
    events,
    eventsAvailable,
    dailyLatest,
  })
}
