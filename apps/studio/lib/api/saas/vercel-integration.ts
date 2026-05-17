import type { JwtPayload } from 'indobase-js'
import type { components } from 'api-types'

import { ENV_VAR_RAW_KEYS } from 'components/interfaces/Integrations/Vercel/Integrations-Vercel.constants'
import { executeQuery } from './query'
import { decryptString, encryptString } from './util'
import { ensureSaasTables, getGotrueUserId, getOrCreateProfile } from './platform'
import { resolveProjectJwtSecret } from './project-jwt'
import { resolveSaaSTenantRestUrls } from './tenant-public-urls'

type Claims = JwtPayload & Record<string, unknown>

type StoredVercelProjectConnection = {
  id: number
  foreign_project_id: string
  supabase_project_ref: string
  env_sync_targets: ('production' | 'preview' | 'development')[]
  public_env_var_prefix?: string
  metadata: {
    name: string
    framework?: string | null
    supabaseConfig?: {
      projectEnvVars: { write: boolean }
    }
  }
  inserted_at: string
  updated_at: string
  user?: {
    id: number
    username: string
    primary_email: string
  }
}

export type VercelIntegrationConnectionJson = {
  access_token_enc?: string
  configuration_id?: string
  team_id?: string | null
  account?: {
    name: string
    avatar: string | null
    type: string
    team_id: string | null
    team_slug: string | null
    source: string
  }
  project_connections?: StoredVercelProjectConnection[]
}

function resolveVercelClientId(): string | undefined {
  return (
    process.env.VERCEL_INTEGRATION_CLIENT_ID?.trim() ||
    process.env.VERCEL_CLIENT_ID?.trim() ||
    undefined
  )
}

function resolveVercelClientSecret(): string | undefined {
  return (
    process.env.VERCEL_INTEGRATION_CLIENT_SECRET?.trim() ||
    process.env.VERCEL_CLIENT_SECRET?.trim() ||
    undefined
  )
}

export function isVercelOAuthConfigured(): boolean {
  return Boolean(resolveVercelClientId() && resolveVercelClientSecret())
}

function vercelOAuthRedirectUri(): string {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_INTEGRATION_REDIRECT_URI?.trim() ||
    'https://studio.indobase.in'
  return `${site.replace(/\/$/, '')}/integrations/vercel/install`
}

async function exchangeVercelOAuthCode(code: string): Promise<{
  access_token: string
  team_id?: string | null
  user_id?: string
}> {
  const clientId = resolveVercelClientId()
  const clientSecret = resolveVercelClientSecret()
  if (!clientId || !clientSecret) {
    throw new Error(
      'Vercel OAuth is not configured. Set VERCEL_CLIENT_ID and VERCEL_CLIENT_SECRET on Studio.'
    )
  }

  const response = await fetch('https://api.vercel.com/v2/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: vercelOAuthRedirectUri(),
    }),
  })

  const payload = (await response.json()) as {
    access_token?: string
    team_id?: string | null
    user_id?: string
    error?: string
    error_description?: string
  }

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Vercel token exchange failed')
  }

  return {
    access_token: payload.access_token,
    team_id: payload.team_id ?? null,
    user_id: payload.user_id,
  }
}

async function vercelFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit & { teamId?: string | null }
): Promise<T> {
  const url = new URL(`https://api.vercel.com${path.startsWith('/') ? path : `/${path}`}`)
  if (init?.teamId) {
    url.searchParams.set('teamId', init.teamId)
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const payload = (await response.json()) as T & { error?: { message?: string } }
  if (!response.ok) {
    const message =
      (payload as { error?: { message?: string } }).error?.message ||
      `Vercel API ${response.status} for ${path}`
    throw new Error(message)
  }
  return payload
}

async function fetchVercelAccountMetadata(
  accessToken: string,
  teamId: string | null | undefined,
  source: string
): Promise<VercelIntegrationConnectionJson['account']> {
  if (teamId) {
    const team = await vercelFetch<{ id: string; slug: string; name: string }>(
      accessToken,
      `/v2/teams/${teamId}`,
      { teamId: null }
    )
    return {
      name: team.name ?? team.slug,
      avatar: null,
      type: 'Team',
      team_id: team.id,
      team_slug: team.slug,
      source,
    }
  }

  const user = await vercelFetch<{ user: { name?: string; username?: string; avatar?: string } }>(
    accessToken,
    '/v2/user',
    { teamId: null }
  )
  const name = user.user?.name || user.user?.username || 'Vercel user'
  return {
    name,
    avatar: user.user?.avatar ?? null,
    type: 'Personal',
    team_id: null,
    team_slug: null,
    source,
  }
}

async function resolveOrganizationIdBySlug({
  claims,
  orgSlug,
}: {
  claims: Claims
  orgSlug: string
}): Promise<number | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{ id: number }>({
    query: `
      select o.id
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [orgSlug, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data?.[0]?.id ?? null
}

async function loadVercelIntegrationRow({
  claims,
  organizationId,
}: {
  claims: Claims
  organizationId: number
}) {
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    id: number
    connection: VercelIntegrationConnectionJson
    inserted_at: string
    updated_at: string
  }>({
    query: `
      select id, connection, inserted_at::text, updated_at::text
      from saas.integration_connections
      where organization_id = $1 and integration_slug = 'vercel'
      limit 1
    `,
    parameters: [organizationId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data?.[0] ?? null
}

async function saveVercelIntegrationRow({
  claims,
  organizationId,
  connection,
}: {
  claims: Claims
  organizationId: number
  connection: VercelIntegrationConnectionJson
}) {
  const gotrueId = getGotrueUserId(claims)
  const result = await executeQuery<{ id: number }>({
    query: `
      insert into saas.integration_connections (organization_id, integration_slug, connection)
      values ($1, 'vercel', $2::jsonb)
      on conflict (organization_id, integration_slug) do update set
        connection = excluded.connection,
        updated_at = now()
      returning id
    `,
    parameters: [organizationId, JSON.stringify(connection)],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
  return result.data?.[0]?.id
}

async function getAccessTokenForIntegration(
  connection: VercelIntegrationConnectionJson
): Promise<string | null> {
  const enc = connection.access_token_enc
  if (!enc?.trim()) return null
  return decryptString(enc)
}

export async function createVercelIntegration({
  claims,
  body,
}: {
  claims: Claims
  body: components['schemas']['CreateVercelIntegrationBody']
}): Promise<{ id: string }> {
  const orgId = await resolveOrganizationIdBySlug({
    claims,
    orgSlug: body.organization_slug,
  })
  if (!orgId) {
    throw new Error('Organization not found')
  }

  const token = await exchangeVercelOAuthCode(body.code)
  const teamId = body.teamId ?? token.team_id ?? null
  const account = await fetchVercelAccountMetadata(token.access_token, teamId, body.source)

  const existing = await loadVercelIntegrationRow({ claims, organizationId: orgId })
  const connection: VercelIntegrationConnectionJson = {
    ...(existing?.connection ?? {}),
    access_token_enc: encryptString(token.access_token),
    configuration_id: body.configuration_id,
    team_id: teamId,
    account,
    project_connections: existing?.connection?.project_connections ?? [],
  }

  const id = await saveVercelIntegrationRow({ claims, organizationId: orgId, connection })
  if (!id) throw new Error('Failed to save Vercel integration')
  return { id: String(id) }
}

export async function listVercelProjectsForIntegration({
  claims,
  organizationIntegrationId,
  limit = 1000,
  from,
  search,
}: {
  claims: Claims
  organizationIntegrationId: number
  limit?: number
  from?: number
  search?: string
}): Promise<components['schemas']['GetVercelProjectsResponse']> {
  const row = await loadVercelIntegrationRowById({ claims, organizationIntegrationId })
  if (!row) {
    return { projects: [], pagination: { count: 0, next: null, prev: null } }
  }

  const token = await getAccessTokenForIntegration(row.connection)
  if (!token) {
    return { projects: [], pagination: { count: 0, next: null, prev: null } }
  }

  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (from !== undefined) params.set('from', String(from))
  if (search?.trim()) params.set('search', search.trim())

  const data = await vercelFetch<{
    projects: components['schemas']['GetVercelProjectsResponse']['projects']
  }>(token, `/v9/projects?${params.toString()}`, {
    teamId: row.connection.team_id ?? null,
  })

  const projects = data.projects ?? []
  return {
    projects,
    pagination: {
      count: projects.length,
      next: projects.length >= limit ? (from ?? 0) + limit : null,
      prev: from && from > 0 ? Math.max(0, from - limit) : null,
    },
  }
}

async function loadVercelIntegrationRowById({
  claims,
  organizationIntegrationId,
}: {
  claims: Claims
  organizationIntegrationId: number
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    id: number
    organization_id: number
    connection: VercelIntegrationConnectionJson
    inserted_at: string
    updated_at: string
  }>({
    query: `
      select ic.id, ic.organization_id, ic.connection, ic.inserted_at::text, ic.updated_at::text
      from saas.integration_connections ic
      join saas.organization_members m on m.organization_id = ic.organization_id
      where ic.id = $1 and ic.integration_slug = 'vercel' and m.gotrue_id = $2
      limit 1
    `,
    parameters: [organizationIntegrationId, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data?.[0] ?? null
}

async function findVercelConnectionContext({
  claims,
  connectionId,
}: {
  claims: Claims
  connectionId: number
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    id: number
    organization_id: number
    connection: VercelIntegrationConnectionJson
  }>({
    query: `
      select ic.id, ic.organization_id, ic.connection
      from saas.integration_connections ic
      join saas.organization_members m on m.organization_id = ic.organization_id
      where ic.integration_slug = 'vercel' and m.gotrue_id = $1
    `,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error

  for (const row of rows.data ?? []) {
    const connections = row.connection?.project_connections ?? []
    if (connections.some((c) => Number(c.id) === connectionId)) {
      return row
    }
  }
  return null
}

async function buildProjectEnvMap(projectRef: string, claims: Claims): Promise<Record<string, string>> {
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    ref: string
    connection_string: string | null
    connection_string_enc: string | null
    jwt_secret_enc: string | null
    service_key: string
    anon_key: string
    service_key_enc: string | null
    anon_key_enc: string | null
    data_plane_last_provisioned_at: string | null
  }>({
    query: `
      select
        p.ref,
        p.connection_string,
        p.connection_string_enc,
        p.jwt_secret_enc,
        p.service_key,
        p.anon_key,
        p.service_key_enc,
        p.anon_key_enc,
        p.data_plane_last_provisioned_at
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [projectRef, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const p = rows.data?.[0]
  if (!p) throw new Error('Project not found')

  const hasDedicated = Boolean(
    p.connection_string_enc?.trim() || p.connection_string?.trim()
  )
  const { restUrl } = resolveSaaSTenantRestUrls(projectRef, hasDedicated)
  const apiOrigin = restUrl.replace(/\/rest\/v1\/?$/, '')

  const anonKey = p.anon_key_enc?.trim() ? decryptString(p.anon_key_enc) : p.anon_key
  const serviceKey = p.service_key_enc?.trim()
    ? decryptString(p.service_key_enc)
    : p.service_key
  const jwtSecret = resolveProjectJwtSecret(p.jwt_secret_enc)
  const postgresUrl = p.connection_string_enc?.trim()
    ? decryptString(p.connection_string_enc)
    : p.connection_string ?? ''

  const env: Record<string, string> = {
    SUPABASE_URL: apiOrigin,
    NEXT_PUBLIC_SUPABASE_URL: apiOrigin,
    SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    SUPABASE_JWT_SECRET: jwtSecret,
  }

  if (postgresUrl?.trim()) {
    env.POSTGRES_URL = postgresUrl
    try {
      const parsed = new URL(postgresUrl.replace(/^postgresql:/, 'http:'))
      env.POSTGRES_HOST = parsed.hostname
      env.POSTGRES_PORT = parsed.port || '5432'
      env.POSTGRES_USER = decodeURIComponent(parsed.username)
      env.POSTGRES_PASSWORD = decodeURIComponent(parsed.password)
      env.POSTGRES_DATABASE = parsed.pathname.replace(/^\//, '') || 'postgres'
      env.POSTGRES_URL_NON_POOLING = postgresUrl
      env.POSTGRES_PRISMA_URL = postgresUrl
    } catch {
      // keep POSTGRES_URL only if parse fails
    }
  }

  return env
}

async function syncEnvVarsToVercelProject({
  accessToken,
  teamId,
  foreignProjectId,
  envMap,
  targets,
  keyPrefix,
}: {
  accessToken: string
  teamId: string | null | undefined
  foreignProjectId: string
  envMap: Record<string, string>
  targets: ('production' | 'preview' | 'development')[]
  keyPrefix?: string
}) {
  const existing = await vercelFetch<{ envs: { id: string; key: string }[] }>(
    accessToken,
    `/v10/projects/${foreignProjectId}/env`,
    { teamId: teamId ?? null }
  )
  const byKey = new Map((existing.envs ?? []).map((e) => [e.key, e.id]))

  for (const key of ENV_VAR_RAW_KEYS) {
    const value = envMap[key]
    if (value === undefined) continue
    const envKey = keyPrefix ? `${keyPrefix}${key}` : key
    const body = {
      key: envKey,
      value,
      type: 'encrypted',
      target: targets,
    }

    const existingId = byKey.get(envKey)
    if (existingId) {
      await vercelFetch(accessToken, `/v10/projects/${foreignProjectId}/env/${existingId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        teamId: teamId ?? null,
      })
    } else {
      await vercelFetch(accessToken, `/v10/projects/${foreignProjectId}/env`, {
        method: 'POST',
        body: JSON.stringify(body),
        teamId: teamId ?? null,
      })
    }
  }
}

export async function createVercelConnection({
  claims,
  body,
}: {
  claims: Claims
  body: components['schemas']['CreateVercelConnectionsBody']
}): Promise<components['schemas']['CreateVercelConnectionResponse']> {
  const integrationId = Number.parseInt(body.organization_integration_id, 10)
  const row = await loadVercelIntegrationRowById({ claims, organizationIntegrationId: integrationId })
  if (!row) throw new Error('Vercel integration not found')

  const profile = await getOrCreateProfile(claims)
  const connection = row.connection ?? {}
  const projectConnections = [...(connection.project_connections ?? [])]
  const nextId =
    projectConnections.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1
  const now = new Date().toISOString()

  const created: StoredVercelProjectConnection = {
    id: nextId,
    foreign_project_id: body.connection.foreign_project_id,
    supabase_project_ref: body.connection.supabase_project_ref,
    env_sync_targets: ['production', 'preview'],
    metadata: {
      name: String((body.connection.metadata as { name?: string })?.name ?? body.connection.foreign_project_id),
      framework: (body.connection.metadata as { framework?: string | null })?.framework ?? null,
      supabaseConfig: { projectEnvVars: { write: true } },
    },
    inserted_at: now,
    updated_at: now,
    user: {
      id: profile.id,
      username: profile.username,
      primary_email: profile.primary_email,
    },
  }

  projectConnections.push(created)

  await saveVercelIntegrationRow({
    claims,
    organizationId: row.organization_id,
    connection: { ...connection, project_connections: projectConnections },
  })

  let envSyncError: { message: string } | undefined
  try {
    const token = await getAccessTokenForIntegration(connection)
    if (token) {
      const envMap = await buildProjectEnvMap(body.connection.supabase_project_ref, claims)
      await syncEnvVarsToVercelProject({
        accessToken: token,
        teamId: connection.team_id,
        foreignProjectId: body.connection.foreign_project_id,
        envMap,
        targets: created.env_sync_targets,
        keyPrefix: undefined,
      })
    }
  } catch (e) {
    envSyncError = {
      message: e instanceof Error ? e.message : 'Failed to sync environment variables to Vercel',
    }
  }

  return { id: String(created.id), env_sync_error: envSyncError }
}

export async function updateVercelConnection({
  claims,
  connectionId,
  patch,
}: {
  claims: Claims
  connectionId: number
  patch: components['schemas']['UpdateVercelConnectionsBody']
}): Promise<void> {
  const ctx = await findVercelConnectionContext({ claims, connectionId })
  if (!ctx) throw new Error('Vercel connection not found')

  const connection = ctx.connection ?? {}
  const projectConnections = [...(connection.project_connections ?? [])]
  const index = projectConnections.findIndex((c) => Number(c.id) === connectionId)
  if (index < 0) throw new Error('Vercel connection not found')

  const current = projectConnections[index]!
  const updated: StoredVercelProjectConnection = {
    ...current,
    env_sync_targets: (patch.env_sync_targets as StoredVercelProjectConnection['env_sync_targets']) ??
      current.env_sync_targets,
    public_env_var_prefix: patch.public_env_var_prefix ?? current.public_env_var_prefix,
    updated_at: new Date().toISOString(),
  }
  projectConnections[index] = updated

  await saveVercelIntegrationRow({
    claims,
    organizationId: ctx.organization_id,
    connection: { ...connection, project_connections: projectConnections },
  })

  if (patch.env_sync_targets?.length) {
    const token = await getAccessTokenForIntegration(connection)
    if (token) {
      const envMap = await buildProjectEnvMap(updated.supabase_project_ref, claims)
      await syncEnvVarsToVercelProject({
        accessToken: token,
        teamId: connection.team_id,
        foreignProjectId: updated.foreign_project_id,
        envMap,
        targets: updated.env_sync_targets,
        keyPrefix: updated.public_env_var_prefix,
      })
    }
  }
}

export async function deleteVercelConnection({
  claims,
  connectionId,
}: {
  claims: Claims
  connectionId: number
}): Promise<{ id: string } | null> {
  const ctx = await findVercelConnectionContext({ claims, connectionId })
  if (!ctx) return null

  const connection = ctx.connection ?? {}
  const before = connection.project_connections ?? []
  const after = before.filter((c) => Number(c.id) !== connectionId)
  if (after.length === before.length) return null

  await saveVercelIntegrationRow({
    claims,
    organizationId: ctx.organization_id,
    connection: { ...connection, project_connections: after },
  })

  return { id: String(connectionId) }
}

export async function syncVercelConnectionEnvironments({
  claims,
  connectionId,
}: {
  claims: Claims
  connectionId: number
}): Promise<void> {
  const ctx = await findVercelConnectionContext({ claims, connectionId })
  if (!ctx) throw new Error('Vercel connection not found')

  const connection = ctx.connection ?? {}
  const stored = (connection.project_connections ?? []).find((c) => Number(c.id) === connectionId)
  if (!stored) throw new Error('Vercel connection not found')

  const token = await getAccessTokenForIntegration(connection)
  if (!token) throw new Error('Vercel integration is missing an access token')

  const envMap = await buildProjectEnvMap(stored.supabase_project_ref, claims)
  await syncEnvVarsToVercelProject({
    accessToken: token,
    teamId: connection.team_id,
    foreignProjectId: stored.foreign_project_id,
    envMap,
    targets: stored.env_sync_targets?.length
      ? stored.env_sync_targets
      : ['production', 'preview'],
    keyPrefix: stored.public_env_var_prefix,
  })
}

export function mapVercelOrgIntegrationProjectConnections(
  integrationRow: {
    id: number
    integration_slug: string
    connection: VercelIntegrationConnectionJson
    inserted_at: string
    updated_at: string
  },
  orgSlug: string,
  addedBy: { username: string; primary_email: string }
) {
  const projectConnections = integrationRow.connection?.project_connections ?? []
  return projectConnections.map((conn) => ({
    id: String(conn.id),
    inserted_at: conn.inserted_at,
    updated_at: conn.updated_at,
    organization_integration_id: String(integrationRow.id),
    supabase_project_ref: conn.supabase_project_ref,
    foreign_project_id: conn.foreign_project_id,
    env_sync_targets: conn.env_sync_targets ?? [],
    public_env_var_prefix: conn.public_env_var_prefix ?? '',
    metadata: {
      name: conn.metadata?.name ?? conn.foreign_project_id,
      framework: conn.metadata?.framework ?? null,
      supabaseConfig: conn.metadata?.supabaseConfig ?? {
        projectEnvVars: { write: true },
      },
    },
    added_by: {
      username: conn.user?.username ?? addedBy.username,
      primary_email: conn.user?.primary_email ?? addedBy.primary_email,
    },
  }))
}

export function getVercelRedirectUrl(installationId: string): { url: string } {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, '') || 'https://studio.indobase.in'
  return {
    url: `${site}/integrations/vercel/install?configurationId=${encodeURIComponent(installationId)}`,
  }
}
