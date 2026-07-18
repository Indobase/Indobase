import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getStorageAdminClient } from 'lib/api/storage-admin'
import { recordAuditLog } from './audit'
import { ensureSaasTables, getGotrueUserId } from './platform'
import { isPlatformOperator } from './platform-operator'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, unknown>

export type PlatformAdminMeteringHealth = {
  metering_enabled: boolean
  last_event_occurred_at: string | null
  events_last_24h: number
  events_last_7d: number
}

export type PlatformAdminProblemsSummary = {
  unhealthy_projects: number
  provision_failed_projects: number
}

export type PlatformAdminOverview = {
  organizations: number
  projects: number
  profiles: number
  members: number
  projects_by_status: { status: string; count: number }[]
  recent_profiles_7d: number
  recent_projects_7d: number
  recent_organizations_7d: number
  usage?: {
    metering_enabled: boolean
    requests_30d: number
    bytes_sent_30d: number
    errors_30d: number
    active_projects_30d: number
  }
  metering?: PlatformAdminMeteringHealth
  problems?: PlatformAdminProblemsSummary
}

export type PlatformAdminOrganization = {
  id: number
  slug: string
  name: string
  plan: string
  owner_gotrue_id: string
  billing_email: string | null
  member_count: number
  project_count: number
  created_at: string
  requests_30d?: number
  bytes_sent_30d?: number
  errors_30d?: number
}

export type PlatformAdminProject = {
  id: number
  ref: string
  name: string
  status: string
  organization_slug: string
  organization_name: string
  cloud_provider: string
  region: string
  has_dedicated_db: boolean
  inserted_at: string
  requests_30d?: number
  bytes_sent_30d?: number
  errors_30d?: number
}

export type PlatformAdminUser = {
  gotrue_id: string
  primary_email: string
  username: string
  first_name: string | null
  last_name: string | null
  org_count: number
  inserted_at: string
  requests_30d?: number
  bytes_sent_30d?: number
  errors_30d?: number
}

export type PlatformAdminAuditLog = {
  id: string
  organization_id: number | null
  project_ref: string | null
  actor_gotrue_id: string | null
  actor_email: string | null
  action: string
  target_type: string
  target_description: string | null
  occurred_at: string
}

export type PlatformAdminAuditLogFilters = {
  search?: string
  action?: string
  actor_gotrue_id?: string
  organization_id?: number
  project_ref?: string
  from?: string
  to?: string
}

export type PlatformAdminUsageDaily = {
  day: string
  requests: number
  bytes_sent: number
  errors: number
}

export type PlatformAdminUsageReport = {
  metering_enabled: boolean
  period_days: number
  metering_health?: PlatformAdminMeteringHealth
  totals: {
    requests: number
    bytes_sent: number
    errors: number
    active_projects: number
  }
  daily: PlatformAdminUsageDaily[]
  top_organizations: Array<
    Pick<PlatformAdminOrganization, 'id' | 'slug' | 'name' | 'plan'> & {
      requests: number
      bytes_sent: number
      errors: number
      project_count: number
    }
  >
  top_projects: Array<
    Pick<PlatformAdminProject, 'ref' | 'name' | 'organization_slug' | 'organization_name'> & {
      requests: number
      bytes_sent: number
      errors: number
    }
  >
  top_users: Array<
    Pick<PlatformAdminUser, 'gotrue_id' | 'primary_email' | 'username'> & {
      org_count: number
      project_count: number
      requests: number
      bytes_sent: number
      errors: number
    }
  >
}

async function hasUsageMeteringTable(): Promise<boolean> {
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

function clampUsageDays(days: number): number {
  return Math.min(Math.max(days, 1), 90)
}

const USAGE_30D_CTE = `
  project_usage_30d as (
    select
      ue.project_ref,
      count(*)::bigint as requests,
      coalesce(sum(ue.bytes_sent), 0)::bigint as bytes_sent,
      sum(case when coalesce(ue.status_code, 0) >= 400 then 1 else 0 end)::bigint as errors
    from saas.usage_events ue
    where ue.occurred_at >= now() - interval '30 days'
    group by ue.project_ref
  )
`

export async function getPlatformAdminOverview(): Promise<PlatformAdminOverview> {
  await ensureSaasTables()

  const result = await executeQuery<{
    organizations: string
    projects: string
    profiles: string
    members: string
    recent_profiles_7d: string
    recent_projects_7d: string
    recent_organizations_7d: string
  }>({
    query: `
      select
        (select count(*)::text from saas.organizations) as organizations,
        (select count(*)::text from saas.projects) as projects,
        (select count(*)::text from saas.profiles) as profiles,
        (select count(*)::text from saas.organization_members) as members,
        (select count(*)::text from saas.profiles where inserted_at >= now() - interval '7 days') as recent_profiles_7d,
        (select count(*)::text from saas.projects where inserted_at >= now() - interval '7 days') as recent_projects_7d,
        (select count(*)::text from saas.organizations where created_at >= now() - interval '7 days') as recent_organizations_7d
    `,
    parameters: [],
  })
  if (result.error) throw result.error

  const row = result.data?.[0]
  const toNum = (v: string | undefined) => parseInt(v ?? '0', 10)

  const statusResult = await executeQuery<{ status: string; count: string }>({
    query: `
      select status, count(*)::text as count
      from saas.projects
      group by status
      order by count desc
    `,
    parameters: [],
  })
  if (statusResult.error) throw statusResult.error

  const [usageTotals, metering, problems] = await Promise.all([
    getPlatformAdminUsageTotals30d(),
    getPlatformAdminMeteringHealth(),
    getPlatformAdminProblemsSummary(),
  ])

  return {
    organizations: toNum(row?.organizations),
    projects: toNum(row?.projects),
    profiles: toNum(row?.profiles),
    members: toNum(row?.members),
    recent_profiles_7d: toNum(row?.recent_profiles_7d),
    recent_projects_7d: toNum(row?.recent_projects_7d),
    recent_organizations_7d: toNum(row?.recent_organizations_7d),
    projects_by_status: (statusResult.data ?? []).map((s) => ({
      status: s.status,
      count: parseInt(s.count, 10),
    })),
    ...usageTotals,
    metering,
    problems,
  }
}

async function getPlatformAdminUsageTotals30d(): Promise<{
  usage: PlatformAdminOverview['usage']
}> {
  const metering_enabled = await hasUsageMeteringTable()
  if (!metering_enabled) {
    return {
      usage: {
        metering_enabled: false,
        requests_30d: 0,
        bytes_sent_30d: 0,
        errors_30d: 0,
        active_projects_30d: 0,
      },
    }
  }

  const usageResult = await executeQuery<{
    requests: string
    bytes_sent: string
    errors: string
    active_projects: string
  }>({
    query: `
      select
        count(*)::text as requests,
        coalesce(sum(bytes_sent), 0)::text as bytes_sent,
        sum(case when coalesce(status_code, 0) >= 400 then 1 else 0 end)::text as errors,
        count(distinct project_ref)::text as active_projects
      from saas.usage_events
      where occurred_at >= now() - interval '30 days'
    `,
    parameters: [],
  })
  if (usageResult.error) throw usageResult.error

  const u = usageResult.data?.[0]
  return {
    usage: {
      metering_enabled: true,
      requests_30d: parseInt(u?.requests ?? '0', 10),
      bytes_sent_30d: parseInt(u?.bytes_sent ?? '0', 10),
      errors_30d: parseInt(u?.errors ?? '0', 10),
      active_projects_30d: parseInt(u?.active_projects ?? '0', 10),
    },
  }
}

async function getPlatformAdminMeteringHealth(): Promise<PlatformAdminMeteringHealth> {
  const metering_enabled = await hasUsageMeteringTable()
  if (!metering_enabled) {
    return {
      metering_enabled: false,
      last_event_occurred_at: null,
      events_last_24h: 0,
      events_last_7d: 0,
    }
  }

  const r = await executeQuery<{ last: string | null; c24: string; c7: string }>({
    query: `
      select
        (select max(occurred_at) from saas.usage_events) as last,
        (select count(*)::text from saas.usage_events where occurred_at >= now() - interval '24 hours') as c24,
        (select count(*)::text from saas.usage_events where occurred_at >= now() - interval '7 days') as c7
    `,
    parameters: [],
  })
  if (r.error || !r.data?.[0]) {
    return {
      metering_enabled: true,
      last_event_occurred_at: null,
      events_last_24h: 0,
      events_last_7d: 0,
    }
  }

  const row = r.data[0]
  return {
    metering_enabled: true,
    last_event_occurred_at: row.last ? new Date(row.last).toISOString() : null,
    events_last_24h: parseInt(row.c24 ?? '0', 10),
    events_last_7d: parseInt(row.c7 ?? '0', 10),
  }
}

async function getPlatformAdminProblemsSummary(): Promise<PlatformAdminProblemsSummary> {
  const r = await executeQuery<{ unhealthy: string; provfail: string }>({
    query: `
      select
        (select count(*)::text from saas.projects p where not p.is_branch and p.status is distinct from 'ACTIVE_HEALTHY') as unhealthy,
        (select count(*)::text from saas.projects p
          where not p.is_branch
            and p.data_plane_last_provision_result is not null
            and (p.data_plane_last_provision_result->>'ok') = 'false'
        ) as provfail
    `,
    parameters: [],
  })
  if (r.error || !r.data?.[0]) {
    return { unhealthy_projects: 0, provision_failed_projects: 0 }
  }

  return {
    unhealthy_projects: parseInt(r.data[0].unhealthy ?? '0', 10),
    provision_failed_projects: parseInt(r.data[0].provfail ?? '0', 10),
  }
}

export async function listAllOrganizationsAdmin({
  search,
  limit = 50,
  offset = 0,
}: {
  search?: string
  limit?: number
  offset?: number
}): Promise<PlatformAdminOrganization[]> {
  await ensureSaasTables()

  const qLimit = Math.min(Math.max(limit, 1), 200)
  const qOffset = Math.max(offset, 0)
  const params: unknown[] = []
  let searchClause = ''

  if (search?.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`)
    searchClause = `where lower(o.name) like $1 or lower(o.slug) like $1`
  }

  params.push(qLimit, qOffset)

  const metering_enabled = await hasUsageMeteringTable()

  const result = await executeQuery<{
    id: number
    slug: string
    name: string
    plan: string
    owner_gotrue_id: string
    billing_email: string | null
    member_count: string
    project_count: string
    created_at: string
    requests_30d: string | null
    bytes_sent_30d: string | null
    errors_30d: string | null
  }>({
    query: metering_enabled
      ? `
      with ${USAGE_30D_CTE}
      select
        o.id,
        o.slug,
        o.name,
        o.plan,
        o.owner_gotrue_id::text as owner_gotrue_id,
        o.billing_email,
        (select count(*)::text from saas.organization_members m where m.organization_id = o.id) as member_count,
        (select count(*)::text from saas.projects p where p.organization_id = o.id) as project_count,
        o.created_at,
        coalesce(sum(pu.requests), 0)::text as requests_30d,
        coalesce(sum(pu.bytes_sent), 0)::text as bytes_sent_30d,
        coalesce(sum(pu.errors), 0)::text as errors_30d
      from saas.organizations o
      left join saas.projects p on p.organization_id = o.id
      left join project_usage_30d pu on pu.project_ref = p.ref
      ${searchClause}
      group by o.id, o.slug, o.name, o.plan, o.owner_gotrue_id, o.billing_email, o.created_at
      order by coalesce(sum(pu.requests), 0) desc, o.created_at desc
      limit $${params.length - 1} offset $${params.length}
    `
      : `
      select
        o.id,
        o.slug,
        o.name,
        o.plan,
        o.owner_gotrue_id::text as owner_gotrue_id,
        o.billing_email,
        (select count(*)::text from saas.organization_members m where m.organization_id = o.id) as member_count,
        (select count(*)::text from saas.projects p where p.organization_id = o.id) as project_count,
        o.created_at,
        null::text as requests_30d,
        null::text as bytes_sent_30d,
        null::text as errors_30d
      from saas.organizations o
      ${searchClause}
      order by o.created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    parameters: params,
  })
  if (result.error) throw result.error

  return (result.data ?? []).map((o) => ({
    id: o.id,
    slug: o.slug,
    name: o.name,
    plan: o.plan,
    owner_gotrue_id: o.owner_gotrue_id,
    billing_email: o.billing_email,
    member_count: parseInt(o.member_count, 10),
    project_count: parseInt(o.project_count, 10),
    created_at: new Date(o.created_at).toISOString(),
    ...(metering_enabled && {
      requests_30d: parseInt(o.requests_30d ?? '0', 10),
      bytes_sent_30d: parseInt(o.bytes_sent_30d ?? '0', 10),
      errors_30d: parseInt(o.errors_30d ?? '0', 10),
    }),
  }))
}

export async function listAllProjectsAdmin({
  search,
  limit = 50,
  offset = 0,
}: {
  search?: string
  limit?: number
  offset?: number
}): Promise<PlatformAdminProject[]> {
  await ensureSaasTables()

  const qLimit = Math.min(Math.max(limit, 1), 200)
  const qOffset = Math.max(offset, 0)
  const params: unknown[] = []
  const conditions: string[] = []

  if (search?.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`)
    conditions.push(
      `(lower(p.ref) like $${params.length} or lower(p.name) like $${params.length} or lower(p.organization_slug) like $${params.length})`
    )
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
  params.push(qLimit, qOffset)

  const metering_enabled = await hasUsageMeteringTable()

  const result = await executeQuery<{
    id: number
    ref: string
    name: string
    status: string
    organization_slug: string
    organization_name: string
    cloud_provider: string
    region: string
    has_dedicated_db: boolean
    inserted_at: string
    requests_30d: string | null
    bytes_sent_30d: string | null
    errors_30d: string | null
  }>({
    query: metering_enabled
      ? `
      with ${USAGE_30D_CTE}
      select
        p.id,
        p.ref,
        p.name,
        p.status,
        p.organization_slug,
        o.name as organization_name,
        p.cloud_provider,
        p.region,
        (
          coalesce(nullif(trim(p.connection_string_enc), ''), nullif(trim(p.connection_string), '')) is not null
        ) as has_dedicated_db,
        p.inserted_at,
        coalesce(pu.requests, 0)::text as requests_30d,
        coalesce(pu.bytes_sent, 0)::text as bytes_sent_30d,
        coalesce(pu.errors, 0)::text as errors_30d
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      left join project_usage_30d pu on pu.project_ref = p.ref
      ${where}
      order by coalesce(pu.requests, 0) desc, p.inserted_at desc
      limit $${params.length - 1} offset $${params.length}
    `
      : `
      select
        p.id,
        p.ref,
        p.name,
        p.status,
        p.organization_slug,
        o.name as organization_name,
        p.cloud_provider,
        p.region,
        (
          coalesce(nullif(trim(p.connection_string_enc), ''), nullif(trim(p.connection_string), '')) is not null
        ) as has_dedicated_db,
        p.inserted_at,
        null::text as requests_30d,
        null::text as bytes_sent_30d,
        null::text as errors_30d
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      ${where}
      order by p.inserted_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    parameters: params,
  })
  if (result.error) throw result.error

  return (result.data ?? []).map((p) => ({
    id: p.id,
    ref: p.ref,
    name: p.name,
    status: p.status,
    organization_slug: p.organization_slug,
    organization_name: p.organization_name,
    cloud_provider: p.cloud_provider,
    region: p.region,
    has_dedicated_db: Boolean(p.has_dedicated_db),
    inserted_at: new Date(p.inserted_at).toISOString(),
    ...(metering_enabled && {
      requests_30d: parseInt(p.requests_30d ?? '0', 10),
      bytes_sent_30d: parseInt(p.bytes_sent_30d ?? '0', 10),
      errors_30d: parseInt(p.errors_30d ?? '0', 10),
    }),
  }))
}

export async function listAllUsersAdmin({
  search,
  limit = 50,
  offset = 0,
}: {
  search?: string
  limit?: number
  offset?: number
}): Promise<PlatformAdminUser[]> {
  await ensureSaasTables()

  const qLimit = Math.min(Math.max(limit, 1), 200)
  const qOffset = Math.max(offset, 0)
  const params: unknown[] = []
  let searchClause = ''

  if (search?.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`)
    searchClause = `where lower(pr.primary_email) like $1 or lower(pr.username) like $1`
  }

  params.push(qLimit, qOffset)

  const metering_enabled = await hasUsageMeteringTable()

  const result = await executeQuery<{
    gotrue_id: string
    primary_email: string
    username: string
    first_name: string | null
    last_name: string | null
    org_count: string
    inserted_at: string
    requests_30d: string | null
    bytes_sent_30d: string | null
    errors_30d: string | null
  }>({
    query: metering_enabled
      ? `
      with ${USAGE_30D_CTE},
      user_usage_30d as (
        select
          m.gotrue_id,
          coalesce(sum(pu.requests), 0)::bigint as requests,
          coalesce(sum(pu.bytes_sent), 0)::bigint as bytes_sent,
          coalesce(sum(pu.errors), 0)::bigint as errors
        from saas.organization_members m
        join saas.projects p on p.organization_id = m.organization_id
        left join project_usage_30d pu on pu.project_ref = p.ref
        group by m.gotrue_id
      )
      select
        pr.gotrue_id::text as gotrue_id,
        pr.primary_email,
        pr.username,
        pr.first_name,
        pr.last_name,
        (select count(*)::text from saas.organization_members m where m.gotrue_id = pr.gotrue_id) as org_count,
        pr.inserted_at,
        coalesce(uu.requests, 0)::text as requests_30d,
        coalesce(uu.bytes_sent, 0)::text as bytes_sent_30d,
        coalesce(uu.errors, 0)::text as errors_30d
      from saas.profiles pr
      left join user_usage_30d uu on uu.gotrue_id = pr.gotrue_id
      ${searchClause}
      order by coalesce(uu.requests, 0) desc, pr.inserted_at desc
      limit $${params.length - 1} offset $${params.length}
    `
      : `
      select
        pr.gotrue_id::text as gotrue_id,
        pr.primary_email,
        pr.username,
        pr.first_name,
        pr.last_name,
        (select count(*)::text from saas.organization_members m where m.gotrue_id = pr.gotrue_id) as org_count,
        pr.inserted_at,
        null::text as requests_30d,
        null::text as bytes_sent_30d,
        null::text as errors_30d
      from saas.profiles pr
      ${searchClause}
      order by pr.inserted_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    parameters: params,
  })
  if (result.error) throw result.error

  return (result.data ?? []).map((u) => ({
    gotrue_id: u.gotrue_id,
    primary_email: u.primary_email,
    username: u.username,
    first_name: u.first_name,
    last_name: u.last_name,
    org_count: parseInt(u.org_count, 10),
    inserted_at: new Date(u.inserted_at).toISOString(),
    ...(metering_enabled && {
      requests_30d: parseInt(u.requests_30d ?? '0', 10),
      bytes_sent_30d: parseInt(u.bytes_sent_30d ?? '0', 10),
      errors_30d: parseInt(u.errors_30d ?? '0', 10),
    }),
  }))
}

export async function listAllAuditLogsAdmin({
  limit = 100,
  offset = 0,
  filters = {},
}: {
  limit?: number
  offset?: number
  filters?: PlatformAdminAuditLogFilters
} = {}): Promise<{ items: PlatformAdminAuditLog[]; total: number }> {
  await ensureSaasTables()

  const qLimit = Math.min(Math.max(limit, 1), 500)
  const qOffset = Math.max(offset, 0)

  const conditions: string[] = []
  const params: unknown[] = []
  let n = 1

  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim().toLowerCase()}%`)
    conditions.push(
      `(lower(coalesce(actor_email, '')) like $${n} or lower(coalesce(actor_gotrue_id::text, '')) like $${n} or lower(coalesce(target_description, '')) like $${n} or lower(coalesce(action::text, '')) like $${n} or lower(coalesce(project_ref, '')) like $${n})`
    )
    n += 1
  }
  if (filters.action?.trim()) {
    params.push(filters.action.trim())
    conditions.push(`action = $${n}`)
    n += 1
  }
  if (filters.actor_gotrue_id?.trim()) {
    params.push(filters.actor_gotrue_id.trim())
    conditions.push(`actor_gotrue_id = $${n}::uuid`)
    n += 1
  }
  if (filters.organization_id != null && Number.isFinite(filters.organization_id)) {
    params.push(filters.organization_id)
    conditions.push(`organization_id = $${n}`)
    n += 1
  }
  if (filters.project_ref?.trim()) {
    params.push(filters.project_ref.trim())
    conditions.push(`project_ref = $${n}`)
    n += 1
  }
  if (filters.from?.trim()) {
    params.push(filters.from.trim())
    conditions.push(`occurred_at >= $${n}::timestamptz`)
    n += 1
  }
  if (filters.to?.trim()) {
    params.push(filters.to.trim())
    conditions.push(`occurred_at <= $${n}::timestamptz`)
    n += 1
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''

  const countResult = await executeQuery<{ count: string }>({
    query: `select count(*)::text as count from saas.audit_logs ${where}`,
    parameters: params,
  })
  if (countResult.error) throw countResult.error
  const total = parseInt(countResult.data?.[0]?.count ?? '0', 10)

  const listParams = [...params, qLimit, qOffset]
  const limitIdx = n
  const offsetIdx = n + 1

  const result = await executeQuery<{
    id: string
    organization_id: number | null
    project_ref: string | null
    actor_gotrue_id: string | null
    actor_email: string | null
    action: string
    target_type: string
    target_description: string | null
    occurred_at: string
  }>({
    query: `
      select
        id::text as id,
        organization_id,
        project_ref,
        actor_gotrue_id::text as actor_gotrue_id,
        actor_email,
        action,
        target_type,
        target_description,
        occurred_at
      from saas.audit_logs
      ${where}
      order by occurred_at desc
      limit $${limitIdx} offset $${offsetIdx}
    `,
    parameters: listParams,
  })
  if (result.error) throw result.error

  const items = (result.data ?? []).map((log) => ({
    ...log,
    occurred_at: new Date(log.occurred_at).toISOString(),
  }))

  return { items, total }
}

export async function getPlatformAdminUsageReport({
  days = 30,
}: {
  days?: number
} = {}): Promise<PlatformAdminUsageReport> {
  await ensureSaasTables()

  const period_days = clampUsageDays(days)
  const metering_enabled = await hasUsageMeteringTable()

  if (!metering_enabled) {
    return {
      metering_enabled: false,
      period_days,
      metering_health: await getPlatformAdminMeteringHealth(),
      totals: { requests: 0, bytes_sent: 0, errors: 0, active_projects: 0 },
      daily: [],
      top_organizations: [],
      top_projects: [],
      top_users: [],
    }
  }

  const intervalParam = `${period_days} days`

  const totalsResult = await executeQuery<{
    requests: string
    bytes_sent: string
    errors: string
    active_projects: string
  }>({
    query: `
      select
        count(*)::text as requests,
        coalesce(sum(bytes_sent), 0)::text as bytes_sent,
        sum(case when coalesce(status_code, 0) >= 400 then 1 else 0 end)::text as errors,
        count(distinct project_ref)::text as active_projects
      from saas.usage_events
      where occurred_at >= now() - $1::interval
    `,
    parameters: [intervalParam],
  })
  if (totalsResult.error) throw totalsResult.error

  const dailyResult = await executeQuery<{
    day: string
    requests: string
    bytes_sent: string
    errors: string
  }>({
    query: `
      select
        date_trunc('day', occurred_at)::date::text as day,
        count(*)::text as requests,
        coalesce(sum(bytes_sent), 0)::text as bytes_sent,
        sum(case when coalesce(status_code, 0) >= 400 then 1 else 0 end)::text as errors
      from saas.usage_events
      where occurred_at >= now() - $1::interval
      group by 1
      order by 1 desc
    `,
    parameters: [intervalParam],
  })
  if (dailyResult.error) throw dailyResult.error

  const topOrgsResult = await executeQuery<{
    id: number
    slug: string
    name: string
    plan: string
    project_count: string
    requests: string
    bytes_sent: string
    errors: string
  }>({
    query: `
      with project_usage as (
        select
          ue.project_ref,
          count(*)::bigint as requests,
          coalesce(sum(ue.bytes_sent), 0)::bigint as bytes_sent,
          sum(case when coalesce(ue.status_code, 0) >= 400 then 1 else 0 end)::bigint as errors
        from saas.usage_events ue
        where ue.occurred_at >= now() - $1::interval
        group by ue.project_ref
      )
      select
        o.id,
        o.slug,
        o.name,
        o.plan,
        count(distinct p.id)::text as project_count,
        coalesce(sum(pu.requests), 0)::text as requests,
        coalesce(sum(pu.bytes_sent), 0)::text as bytes_sent,
        coalesce(sum(pu.errors), 0)::text as errors
      from saas.organizations o
      join saas.projects p on p.organization_id = o.id
      left join project_usage pu on pu.project_ref = p.ref
      group by o.id, o.slug, o.name, o.plan
      having coalesce(sum(pu.requests), 0) > 0
      order by coalesce(sum(pu.requests), 0) desc
      limit 25
    `,
    parameters: [intervalParam],
  })
  if (topOrgsResult.error) throw topOrgsResult.error

  const topProjectsResult = await executeQuery<{
    ref: string
    name: string
    organization_slug: string
    organization_name: string
    requests: string
    bytes_sent: string
    errors: string
  }>({
    query: `
      with project_usage as (
        select
          ue.project_ref,
          count(*)::bigint as requests,
          coalesce(sum(ue.bytes_sent), 0)::bigint as bytes_sent,
          sum(case when coalesce(ue.status_code, 0) >= 400 then 1 else 0 end)::bigint as errors
        from saas.usage_events ue
        where ue.occurred_at >= now() - $1::interval
        group by ue.project_ref
      )
      select
        p.ref,
        p.name,
        p.organization_slug,
        o.name as organization_name,
        pu.requests::text as requests,
        pu.bytes_sent::text as bytes_sent,
        pu.errors::text as errors
      from project_usage pu
      join saas.projects p on p.ref = pu.project_ref
      join saas.organizations o on o.id = p.organization_id
      order by pu.requests desc
      limit 25
    `,
    parameters: [intervalParam],
  })
  if (topProjectsResult.error) throw topProjectsResult.error

  const topUsersResult = await executeQuery<{
    gotrue_id: string
    primary_email: string
    username: string
    org_count: string
    project_count: string
    requests: string
    bytes_sent: string
    errors: string
  }>({
    query: `
      with project_usage as (
        select
          ue.project_ref,
          count(*)::bigint as requests,
          coalesce(sum(ue.bytes_sent), 0)::bigint as bytes_sent,
          sum(case when coalesce(ue.status_code, 0) >= 400 then 1 else 0 end)::bigint as errors
        from saas.usage_events ue
        where ue.occurred_at >= now() - $1::interval
        group by ue.project_ref
      ),
      user_project_usage as (
        select
          m.gotrue_id,
          p.ref as project_ref,
          pu.requests,
          pu.bytes_sent,
          pu.errors
        from saas.organization_members m
        join saas.projects p on p.organization_id = m.organization_id
        join project_usage pu on pu.project_ref = p.ref
      )
      select
        pr.gotrue_id::text as gotrue_id,
        pr.primary_email,
        pr.username,
        count(distinct m.organization_id)::text as org_count,
        count(distinct upu.project_ref)::text as project_count,
        coalesce(sum(upu.requests), 0)::text as requests,
        coalesce(sum(upu.bytes_sent), 0)::text as bytes_sent,
        coalesce(sum(upu.errors), 0)::text as errors
      from saas.profiles pr
      join user_project_usage upu on upu.gotrue_id = pr.gotrue_id
      join saas.organization_members m on m.gotrue_id = pr.gotrue_id
      group by pr.gotrue_id, pr.primary_email, pr.username
      having coalesce(sum(upu.requests), 0) > 0
      order by coalesce(sum(upu.requests), 0) desc
      limit 25
    `,
    parameters: [intervalParam],
  })
  if (topUsersResult.error) throw topUsersResult.error

  const totals = totalsResult.data?.[0]

  const metering_health = await getPlatformAdminMeteringHealth()

  return {
    metering_enabled: true,
    period_days,
    metering_health,
    totals: {
      requests: parseInt(totals?.requests ?? '0', 10),
      bytes_sent: parseInt(totals?.bytes_sent ?? '0', 10),
      errors: parseInt(totals?.errors ?? '0', 10),
      active_projects: parseInt(totals?.active_projects ?? '0', 10),
    },
    daily: (dailyResult.data ?? []).map((row) => ({
      day: row.day,
      requests: parseInt(row.requests, 10),
      bytes_sent: parseInt(row.bytes_sent, 10),
      errors: parseInt(row.errors, 10),
    })),
    top_organizations: (topOrgsResult.data ?? []).map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      plan: o.plan,
      project_count: parseInt(o.project_count, 10),
      requests: parseInt(o.requests, 10),
      bytes_sent: parseInt(o.bytes_sent, 10),
      errors: parseInt(o.errors, 10),
    })),
    top_projects: (topProjectsResult.data ?? []).map((p) => ({
      ref: p.ref,
      name: p.name,
      organization_slug: p.organization_slug,
      organization_name: p.organization_name,
      requests: parseInt(p.requests, 10),
      bytes_sent: parseInt(p.bytes_sent, 10),
      errors: parseInt(p.errors, 10),
    })),
    top_users: (topUsersResult.data ?? []).map((u) => ({
      gotrue_id: u.gotrue_id,
      primary_email: u.primary_email,
      username: u.username,
      org_count: parseInt(u.org_count, 10),
      project_count: parseInt(u.project_count, 10),
      requests: parseInt(u.requests, 10),
      bytes_sent: parseInt(u.bytes_sent, 10),
      errors: parseInt(u.errors, 10),
    })),
  }
}

function isPlatformAdminProjectDeleteTeardownEnabled(): boolean {
  return process.env.PLATFORM_ADMIN_PROJECT_DELETE_TEARDOWN !== 'false'
}

/**
 * Best-effort full teardown for Option A (dedicated DB + data-plane provisioner):
 * 1) `docker compose down -v` + Traefik file removal via provisioner `/teardown` when configured.
 * 2) Drop tenant DB + role on the control-plane Postgres cluster when the project row has a dedicated URL.
 *
 * Set `PLATFORM_ADMIN_PROJECT_DELETE_TEARDOWN=false` to only delete control-plane rows (legacy).
 */
async function platformAdminTeardownProjectInfrastructure(
  ref: string,
  hasDedicatedDb: boolean
): Promise<void> {
  if (!isPlatformAdminProjectDeleteTeardownEnabled()) {
    return
  }

  const { isDataPlaneProvisionerConfigured, teardownTenantDataPlaneStack } = await import(
    './tenant-data-plane-provision'
  )
  if (isDataPlaneProvisionerConfigured()) {
    await teardownTenantDataPlaneStack({ ref, apply: true })
  }

  if (!hasDedicatedDb) {
    return
  }

  const host = process.env.POSTGRES_HOST?.trim()
  const adminPassword = process.env.POSTGRES_PASSWORD ?? ''
  const { resolveTenantProvisionAdminUser, destroyTenantDatabase } = await import('./provision-tenant-db')
  const adminUser = resolveTenantProvisionAdminUser()
  const port = parseInt(process.env.POSTGRES_PORT || '5432', 10)
  if (!host || !adminPassword) {
    throw new Error(
      'This project has a dedicated tenant database but POSTGRES_HOST/POSTGRES_PASSWORD are not set on Studio, so the database cannot be dropped. Fix env or set PLATFORM_ADMIN_PROJECT_DELETE_TEARDOWN=false to delete control-plane metadata only.'
    )
  }

  await destroyTenantDatabase({
    projectRef: ref,
    host,
    port,
    adminUser,
    adminPassword,
  })
}

export async function adminDeleteOrganization({
  claims,
  slug,
}: {
  claims: Claims
  slug: string
}): Promise<boolean> {
  await ensureSaasTables()
  const actorId = getGotrueUserId(claims)

  const orgRow = await executeQuery<{ id: number; name: string }>({
    query: `select id, name from saas.organizations where slug = $1 limit 1`,
    parameters: [slug],
    actorId,
  })
  if (orgRow.error) throw orgRow.error
  const targetOrg = orgRow.data?.[0]
  if (!targetOrg) return false

  const projects = await executeQuery<{
    ref: string
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.ref, p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where o.slug = $1
    `,
    parameters: [slug],
    actorId,
  })
  if (projects.error) throw projects.error
  for (const p of projects.data ?? []) {
    const hasDedicatedDb = Boolean(
      (p.connection_string_enc ?? '').trim() || (p.connection_string ?? '').trim()
    )
    await platformAdminTeardownProjectInfrastructure(p.ref, hasDedicatedDb)
  }

  const deleteProjects = await executeQuery({
    query: `
      delete from saas.projects p
      using saas.organizations o
      where o.id = p.organization_id and o.slug = $1
    `,
    parameters: [slug],
    actorId,
  })
  if (deleteProjects.error) throw deleteProjects.error

  const deleted = await executeQuery<{ slug: string }>({
    query: `
      delete from saas.organizations o
      where o.slug = $1
        and (select set_config('app.allow_organization_teardown', 'true', true)) is not null
      returning o.slug
    `,
    parameters: [slug],
    actorId,
  })
  if (deleted.error) throw deleted.error
  const wasDeleted = Boolean(deleted.data?.length)

  if (wasDeleted) {
    await recordAuditLog({
      claims,
      organizationId: null,
      action: 'org.delete',
      targetType: 'organization',
      targetDescription: `Organization "${targetOrg.name}" (${slug}) [platform admin]`,
      metadata: { slug, organization_id: targetOrg.id, platform_admin: true, infrastructure_teardown: isPlatformAdminProjectDeleteTeardownEnabled() },
    })
  }

  return wasDeleted
}

export async function adminDeleteProject({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<boolean> {
  await ensureSaasTables()
  const actorId = getGotrueUserId(claims)

  const existing = await executeQuery<{
    id: number
    name: string
    ref: string
    organization_id: number
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select id, name, ref, organization_id, connection_string, connection_string_enc
      from saas.projects
      where ref = $1
      limit 1
    `,
    parameters: [ref],
    actorId,
  })
  if (existing.error) throw existing.error
  const row = existing.data?.[0]
  if (!row) return false

  const hasDedicatedDb = Boolean(
    (row.connection_string_enc ?? '').trim() || (row.connection_string ?? '').trim()
  )

  await platformAdminTeardownProjectInfrastructure(row.ref, hasDedicatedDb)

  const deleted = await executeQuery<{
    id: number
    name: string
    ref: string
    organization_id: number
  }>({
    query: `delete from saas.projects where ref = $1 returning id, name, ref, organization_id`,
    parameters: [ref],
    actorId,
  })
  if (deleted.error) throw deleted.error
  if (!deleted.data?.length) return false

  const d = deleted.data[0]!

  await recordAuditLog({
    claims,
    organizationId: d.organization_id,
    projectRef: d.ref,
    action: 'project.delete',
    targetType: 'project',
    targetDescription: `Project "${d.name}" (${d.ref}) [platform admin]`,
    metadata: {
      project_id: d.id,
      platform_admin: true,
      infrastructure_teardown: isPlatformAdminProjectDeleteTeardownEnabled(),
    },
  })

  return true
}

export async function adminDeleteUser({
  claims,
  gotrueId,
}: {
  claims: Claims
  gotrueId: string
}): Promise<boolean> {
  await ensureSaasTables()
  const actorId = getGotrueUserId(claims)

  const profileRow = await executeQuery<{
    gotrue_id: string
    primary_email: string
    username: string
  }>({
    query: `
      select gotrue_id::text, primary_email, username
      from saas.profiles
      where gotrue_id = $1::uuid
      limit 1
    `,
    parameters: [gotrueId],
    actorId,
  })
  if (profileRow.error) throw profileRow.error
  const profile = profileRow.data?.[0]
  if (!profile) return false

  if (isPlatformOperator({ sub: gotrueId, email: profile.primary_email } as Claims)) {
    throw new Error('Cannot delete a platform operator account')
  }

  if (gotrueId === actorId) {
    throw new Error('Cannot delete your own account')
  }

  const ownedOrgs = await executeQuery<{ count: string }>({
    query: `select count(*)::text as count from saas.organizations where owner_gotrue_id = $1::uuid`,
    parameters: [gotrueId],
    actorId,
  })
  if (ownedOrgs.error) throw ownedOrgs.error
  const ownedCount = parseInt(ownedOrgs.data?.[0]?.count ?? '0', 10)
  if (ownedCount > 0) {
    throw new Error(
      `User owns ${ownedCount} organization(s). Delete those organizations first or transfer ownership.`
    )
  }

  const deleteMembers = await executeQuery({
    query: `delete from saas.organization_members where gotrue_id = $1::uuid`,
    parameters: [gotrueId],
    actorId,
  })
  if (deleteMembers.error) throw deleteMembers.error

  const deleteProfile = await executeQuery({
    query: `delete from saas.profiles where gotrue_id = $1::uuid`,
    parameters: [gotrueId],
    actorId,
  })
  if (deleteProfile.error) throw deleteProfile.error

  const { error: authError } = await getStorageAdminClient().auth.admin.deleteUser(gotrueId)
  if (authError) {
    throw new Error(authError.message ?? 'Failed to delete GoTrue user')
  }

  await recordAuditLog({
    claims,
    action: 'user.delete',
    targetType: 'user',
    targetDescription: `User "${profile.primary_email}" (${profile.username}) [platform admin]`,
    metadata: { gotrue_id: gotrueId, platform_admin: true },
  })

  return true
}

export type PlatformAdminOrgMember = {
  gotrue_id: string
  role: string
  primary_email: string | null
  username: string | null
}

export type PlatformAdminOrgProjectRow = {
  id: number
  ref: string
  name: string
  status: string
  inserted_at: string
  data_plane_last_provisioned_at: string | null
  provision_ok: boolean | null
}

export type PlatformAdminOrganizationDetail = {
  organization: {
    id: number
    slug: string
    name: string
    plan: string
    owner_gotrue_id: string
    billing_email: string | null
    billing_partner: string | null
    stripe_customer_id: string | null
    subscription_id: string | null
    usage_billing_enabled: boolean
    restriction_status: string | null
    restriction_data: unknown | null
    created_at: string
    updated_at: string
  }
  members: PlatformAdminOrgMember[]
  projects: PlatformAdminOrgProjectRow[]
}

export async function getPlatformAdminOrganizationDetail(
  slug: string
): Promise<PlatformAdminOrganizationDetail | null> {
  await ensureSaasTables()
  const trimmed = slug.trim()
  if (!trimmed) return null

  const orgResult = await executeQuery<{
    id: number
    slug: string
    name: string
    plan: string
    owner_gotrue_id: string
    billing_email: string | null
    billing_partner: string | null
    stripe_customer_id: string | null
    subscription_id: string | null
    usage_billing_enabled: boolean
    restriction_status: string | null
    restriction_data: unknown | null
    created_at: string
    updated_at: string
  }>({
    query: `
      select
        o.id,
        o.slug,
        o.name,
        o.plan,
        o.owner_gotrue_id::text as owner_gotrue_id,
        o.billing_email,
        o.billing_partner,
        o.stripe_customer_id,
        o.subscription_id,
        o.usage_billing_enabled,
        o.restriction_status,
        o.restriction_data,
        o.created_at,
        o.updated_at
      from saas.organizations o
      where o.slug = $1
      limit 1
    `,
    parameters: [trimmed],
  })
  if (orgResult.error) throw orgResult.error
  const org = orgResult.data?.[0]
  if (!org) return null

  const membersResult = await executeQuery<{
    gotrue_id: string
    role: string
    primary_email: string | null
    username: string | null
  }>({
    query: `
      select
        m.gotrue_id::text as gotrue_id,
        m.role,
        pr.primary_email,
        pr.username
      from saas.organization_members m
      left join saas.profiles pr on pr.gotrue_id = m.gotrue_id
      where m.organization_id = $1
      order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, pr.primary_email nulls last
    `,
    parameters: [org.id],
  })
  if (membersResult.error) throw membersResult.error

  const projectsResult = await executeQuery<{
    id: number
    ref: string
    name: string
    status: string
    inserted_at: string
    data_plane_last_provisioned_at: string | null
    provision_ok: string | null
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.name,
        p.status,
        p.inserted_at,
        p.data_plane_last_provisioned_at,
        (p.data_plane_last_provision_result->>'ok') as provision_ok
      from saas.projects p
      where p.organization_id = $1 and p.is_branch = false
      order by p.inserted_at desc
    `,
    parameters: [org.id],
  })
  if (projectsResult.error) throw projectsResult.error

  const toProvisionOk = (v: string | null): boolean | null => {
    if (v === null || v === undefined) return null
    if (v === 'true') return true
    if (v === 'false') return false
    return null
  }

  return {
    organization: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      plan: org.plan,
      owner_gotrue_id: org.owner_gotrue_id,
      billing_email: org.billing_email,
      billing_partner: org.billing_partner,
      stripe_customer_id: org.stripe_customer_id,
      subscription_id: org.subscription_id,
      usage_billing_enabled: org.usage_billing_enabled,
      restriction_status: org.restriction_status,
      restriction_data: (org.restriction_data as Record<string, unknown> | null) ?? null,
      created_at: new Date(org.created_at).toISOString(),
      updated_at: new Date(org.updated_at).toISOString(),
    },
    members: (membersResult.data ?? []).map((m) => ({
      gotrue_id: m.gotrue_id,
      role: m.role,
      primary_email: m.primary_email,
      username: m.username,
    })),
    projects: (projectsResult.data ?? []).map((p) => ({
      id: p.id,
      ref: p.ref,
      name: p.name,
      status: p.status,
      inserted_at: new Date(p.inserted_at).toISOString(),
      data_plane_last_provisioned_at: p.data_plane_last_provisioned_at
        ? new Date(p.data_plane_last_provisioned_at).toISOString()
        : null,
      provision_ok: toProvisionOk(p.provision_ok),
    })),
  }
}

export const PLATFORM_ADMIN_ALLOWED_PLANS = new Set([
  'free',
  'basic',
  'pro',
  'studio',
  'team', // legacy Studio alias
  'enterprise',
  'platform',
])

export type PlatformOrgAdminPatchInput = {
  billing?: {
    plan?: string | null
    billing_email?: string | null
    usage_billing_enabled?: boolean | null
    stripe_customer_id?: string | null
    subscription_id?: string | null
  }
  suspend?: { reason?: string } | boolean
  unsuspend?: boolean
  support_note?: string | null
  transfer_owner_gotrue_id?: string | null
}

export async function adminApplyOrganizationPlatformPatch({
  claims,
  slug,
  patch,
}: {
  claims: Claims
  slug: string
  patch: PlatformOrgAdminPatchInput
}): Promise<PlatformAdminOrganizationDetail | null> {
  await ensureSaasTables()
  const actorId = getGotrueUserId(claims)

  const orgRow = await executeQuery<{ id: number; name: string; owner_gotrue_id: string }>({
    query: `
      select id, name, owner_gotrue_id::text as owner_gotrue_id
      from saas.organizations where slug = $1 limit 1
    `,
    parameters: [slug],
    actorId,
  })
  if (orgRow.error) throw orgRow.error
  const org = orgRow.data?.[0]
  if (!org) return null

  const didAnything =
    Boolean(patch.billing && Object.keys(patch.billing).length) ||
    patch.suspend ||
    patch.unsuspend ||
    (patch.support_note != null && patch.support_note !== '') ||
    Boolean(patch.transfer_owner_gotrue_id?.trim())

  if (!didAnything) {
    return getPlatformAdminOrganizationDetail(slug)
  }

  if (patch.billing) {
    const b = patch.billing
    let billingTouched = false
    if (b.plan != null && b.plan !== '') {
      const p = b.plan.trim().toLowerCase()
      if (!PLATFORM_ADMIN_ALLOWED_PLANS.has(p)) {
        throw new Error(`Invalid plan "${b.plan}". Allowed: ${[...PLATFORM_ADMIN_ALLOWED_PLANS].join(', ')}`)
      }
      const r = await executeQuery({
        query: `update saas.organizations set plan = $1, updated_at = now() where id = $2`,
        parameters: [p, org.id],
        actorId,
      })
      if (r.error) throw r.error
      billingTouched = true
    }
    if (b.billing_email !== undefined && b.billing_email !== null) {
      const r = await executeQuery({
        query: `update saas.organizations set billing_email = $1, updated_at = now() where id = $2`,
        parameters: [b.billing_email, org.id],
        actorId,
      })
      if (r.error) throw r.error
      billingTouched = true
    }
    if (b.usage_billing_enabled !== undefined && b.usage_billing_enabled !== null) {
      const r = await executeQuery({
        query: `update saas.organizations set usage_billing_enabled = $1, updated_at = now() where id = $2`,
        parameters: [b.usage_billing_enabled, org.id],
        actorId,
      })
      if (r.error) throw r.error
      billingTouched = true
    }
    if (b.stripe_customer_id !== undefined) {
      const v = b.stripe_customer_id?.trim() ?? ''
      const r = await executeQuery({
        query: `update saas.organizations set stripe_customer_id = nullif($1, ''), updated_at = now() where id = $2`,
        parameters: [v, org.id],
        actorId,
      })
      if (r.error) throw r.error
      billingTouched = true
    }
    if (b.subscription_id !== undefined) {
      const v = b.subscription_id?.trim() ?? ''
      const r = await executeQuery({
        query: `update saas.organizations set subscription_id = nullif($1, ''), updated_at = now() where id = $2`,
        parameters: [v, org.id],
        actorId,
      })
      if (r.error) throw r.error
      billingTouched = true
    }
    if (billingTouched) {
      await recordAuditLog({
        claims,
        organizationId: org.id,
        action: 'platform.org.billing_updated',
        targetType: 'organization',
        targetDescription: `Billing fields updated for "${org.name}" (${slug}) [platform admin]`,
        metadata: { slug, patch: patch.billing, platform_admin: true },
      })
    }
  }

  if (patch.support_note != null && patch.support_note.trim() !== '') {
    const note = patch.support_note.trim().slice(0, 8000)
    const actorEmail =
      (claims as { email?: string }).email ??
      (claims as { claims?: { email?: string } }).claims?.email ??
      ''
    const r = await executeQuery({
      query: `
        update saas.organizations
        set
          restriction_data = coalesce(restriction_data, '{}'::jsonb) || jsonb_build_object(
            'platform_support',
            jsonb_build_object(
              'note', to_jsonb($1::text),
              'updated_at', to_jsonb(now()::text),
              'updated_by', to_jsonb($2::text)
            )
          ),
          updated_at = now()
        where id = $3
      `,
      parameters: [note, String(actorEmail), org.id],
      actorId,
    })
    if (r.error) throw r.error
    await recordAuditLog({
      claims,
      organizationId: org.id,
      action: 'platform.org.support_note',
      targetType: 'organization',
      targetDescription: `Support note saved for "${org.name}" (${slug}) [platform admin]`,
      metadata: { slug, platform_admin: true },
    })
  }

  if (patch.suspend) {
    const reason =
      typeof patch.suspend === 'object' && patch.suspend && 'reason' in patch.suspend
        ? String((patch.suspend as { reason?: string }).reason ?? '').slice(0, 2000)
        : ''
    const r = await executeQuery({
      query: `
        update saas.organizations
        set
          restriction_status = 'platform_suspended',
          restriction_data = coalesce(restriction_data, '{}'::jsonb) || jsonb_build_object(
            'platform_suspend',
            jsonb_build_object(
              'reason', to_jsonb($1::text),
              'at', to_jsonb(now()::text)
            )
          ),
          updated_at = now()
        where id = $2
      `,
      parameters: [reason, org.id],
      actorId,
    })
    if (r.error) throw r.error
    await recordAuditLog({
      claims,
      organizationId: org.id,
      action: 'platform.org.suspended',
      targetType: 'organization',
      targetDescription: `Organization "${org.name}" (${slug}) suspended [platform admin]`,
      metadata: { slug, reason, platform_admin: true },
    })
  }

  if (patch.unsuspend) {
    const r = await executeQuery({
      query: `
        update saas.organizations
        set
          restriction_status = case
            when restriction_status = 'platform_suspended' then null
            else restriction_status
          end,
          restriction_data = coalesce(restriction_data, '{}'::jsonb) - 'platform_suspend',
          updated_at = now()
        where id = $1
      `,
      parameters: [org.id],
      actorId,
    })
    if (r.error) throw r.error
    await recordAuditLog({
      claims,
      organizationId: org.id,
      action: 'platform.org.unsuspended',
      targetType: 'organization',
      targetDescription: `Organization "${org.name}" (${slug}) unsuspended [platform admin]`,
      metadata: { slug, platform_admin: true },
    })
  }

  if (patch.transfer_owner_gotrue_id?.trim()) {
    const newOwner = patch.transfer_owner_gotrue_id.trim()
    if (newOwner === org.owner_gotrue_id) {
      throw new Error('User is already the organization owner')
    }

    const memberCheck = await executeQuery<{ role: string }>({
      query: `
        select role from saas.organization_members
        where organization_id = $1 and gotrue_id = $2::uuid
        limit 1
      `,
      parameters: [org.id, newOwner],
      actorId,
    })
    if (memberCheck.error) throw memberCheck.error
    if (!memberCheck.data?.length) {
      throw new Error('New owner must already be a member of this organization')
    }

    const demote = await executeQuery({
      query: `
        update saas.organization_members
        set role = 'admin', updated_at = now()
        where organization_id = $1 and gotrue_id = $2::uuid and role = 'owner'
      `,
      parameters: [org.id, org.owner_gotrue_id],
      actorId,
    })
    if (demote.error) throw demote.error

    const promote = await executeQuery({
      query: `
        update saas.organization_members
        set role = 'owner', updated_at = now()
        where organization_id = $1 and gotrue_id = $2::uuid
      `,
      parameters: [org.id, newOwner],
      actorId,
    })
    if (promote.error) throw promote.error

    const own = await executeQuery({
      query: `
        update saas.organizations
        set owner_gotrue_id = $1::uuid, updated_at = now()
        where id = $2
      `,
      parameters: [newOwner, org.id],
      actorId,
    })
    if (own.error) throw own.error

    await recordAuditLog({
      claims,
      organizationId: org.id,
      action: 'platform.org.owner_transferred',
      targetType: 'organization',
      targetDescription: `Owner changed for "${org.name}" (${slug}) [platform admin]`,
      metadata: {
        slug,
        previous_owner_gotrue_id: org.owner_gotrue_id,
        new_owner_gotrue_id: newOwner,
        platform_admin: true,
      },
    })
  }

  return getPlatformAdminOrganizationDetail(slug)
}

export async function adminSetPlatformUserBanned({
  claims,
  gotrueId,
  banned,
}: {
  claims: Claims
  gotrueId: string
  banned: boolean
}): Promise<void> {
  const actorId = getGotrueUserId(claims)
  if (gotrueId === actorId) {
    throw new Error('Cannot change ban status for your own account')
  }

  const profileRow = await executeQuery<{ primary_email: string; username: string }>({
    query: `select primary_email, username from saas.profiles where gotrue_id = $1::uuid limit 1`,
    parameters: [gotrueId],
    actorId,
  })
  if (profileRow.error) throw profileRow.error
  const profile = profileRow.data?.[0]
  if (!profile) throw new Error('User profile not found')

  if (isPlatformOperator({ sub: gotrueId, email: profile.primary_email } as Claims)) {
    throw new Error('Cannot change ban status for a platform operator')
  }

  const ban_duration = banned ? '876000h' : 'none'
  const { error } = await getStorageAdminClient().auth.admin.updateUserById(gotrueId, {
    ban_duration,
  })
  if (error) {
    throw new Error(error.message ?? 'Failed to update user ban status')
  }

  await recordAuditLog({
    claims,
    action: banned ? 'platform.user.suspended' : 'platform.user.unsuspended',
    targetType: 'user',
    targetDescription: `${banned ? 'Suspended' : 'Unsuspended'} user "${profile.primary_email}" (${profile.username}) [platform admin]`,
    metadata: { gotrue_id: gotrueId, platform_admin: true },
  })
}

export type PlatformAdminProblemProject = {
  id: number
  ref: string
  name: string
  status: string
  organization_slug: string
  organization_name: string
  inserted_at: string
  data_plane_last_provisioned_at: string | null
  provision_ok: boolean | null
  problem_reasons: string[]
}

export async function listProblemProjectsAdmin({
  limit = 100,
}: {
  limit?: number
} = {}): Promise<PlatformAdminProblemProject[]> {
  await ensureSaasTables()
  const qLimit = Math.min(Math.max(limit, 1), 200)

  const result = await executeQuery<{
    id: number
    ref: string
    name: string
    status: string
    organization_slug: string
    organization_name: string
    inserted_at: string
    data_plane_last_provisioned_at: string | null
    provision_ok: string | null
  }>({
    query: `
      select
        p.id,
        p.ref,
        p.name,
        p.status,
        p.organization_slug,
        o.name as organization_name,
        p.inserted_at,
        p.data_plane_last_provisioned_at,
        (p.data_plane_last_provision_result->>'ok') as provision_ok
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where not p.is_branch
        and (
          p.status is distinct from 'ACTIVE_HEALTHY'
          or (
            p.data_plane_last_provision_result is not null
            and (p.data_plane_last_provision_result->>'ok') = 'false'
          )
        )
      order by p.inserted_at desc
      limit $1
    `,
    parameters: [qLimit],
  })
  if (result.error) throw result.error

  return (result.data ?? []).map((p) => {
    const reasons: string[] = []
    if (p.status !== 'ACTIVE_HEALTHY') {
      reasons.push(`Status: ${p.status}`)
    }
    if (p.provision_ok === 'false') {
      reasons.push('Last provision reported failure')
    }
    const ok =
      p.provision_ok === 'true' ? true : p.provision_ok === 'false' ? false : null
    return {
      id: p.id,
      ref: p.ref,
      name: p.name,
      status: p.status,
      organization_slug: p.organization_slug,
      organization_name: p.organization_name,
      inserted_at: new Date(p.inserted_at).toISOString(),
      data_plane_last_provisioned_at: p.data_plane_last_provisioned_at
        ? new Date(p.data_plane_last_provisioned_at).toISOString()
        : null,
      provision_ok: ok,
      problem_reasons: reasons,
    }
  })
}
