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
  }>({
    query: `
      select
        o.id,
        o.slug,
        o.name,
        o.plan,
        o.owner_gotrue_id::text as owner_gotrue_id,
        o.billing_email,
        (select count(*)::text from saas.organization_members m where m.organization_id = o.id) as member_count,
        (select count(*)::text from saas.projects p where p.organization_id = o.id) as project_count,
        o.created_at
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
  }>({
    query: `
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
        p.inserted_at
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
