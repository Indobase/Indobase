import { ensureSaasTables } from './platform'
import { executeQuery } from './query'

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

export type PlatformAdminUsageDaily = {
  day: string
  requests: number
  bytes_sent: number
  errors: number
}

export type PlatformAdminUsageReport = {
  metering_enabled: boolean
  period_days: number
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
    ...(await getPlatformAdminUsageTotals30d()),
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

  const result = await executeQuery<{
    gotrue_id: string
    primary_email: string
    username: string
    first_name: string | null
    last_name: string | null
    org_count: string
    inserted_at: string
  }>({
    query: `
      select
        pr.gotrue_id::text as gotrue_id,
        pr.primary_email,
        pr.username,
        pr.first_name,
        pr.last_name,
        (select count(*)::text from saas.organization_members m where m.gotrue_id = pr.gotrue_id) as org_count,
        pr.inserted_at
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
  }))
}

export async function listAllAuditLogsAdmin({
  limit = 100,
  offset = 0,
}: {
  limit?: number
  offset?: number
}): Promise<PlatformAdminAuditLog[]> {
  await ensureSaasTables()

  const qLimit = Math.min(Math.max(limit, 1), 500)
  const qOffset = Math.max(offset, 0)

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
      order by occurred_at desc
      limit $1 offset $2
    `,
    parameters: [qLimit, qOffset],
  })
  if (result.error) throw result.error

  return (result.data ?? []).map((log) => ({
    ...log,
    occurred_at: new Date(log.occurred_at).toISOString(),
  }))
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
      totals: { requests: 0, bytes_sent: 0, errors: 0, active_projects: 0 },
      daily: [],
      top_organizations: [],
      top_projects: [],
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

  const totals = totalsResult.data?.[0]

  return {
    metering_enabled: true,
    period_days,
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
  }
}
