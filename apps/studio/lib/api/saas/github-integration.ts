import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { components } from 'api-types'

import { executeQuery } from './query'
import { decryptString, encryptString } from './util'
import { ensureSaasTables, getGotrueUserId, getOrCreateProfile } from './platform'

type Claims = JwtPayload & Record<string, unknown>

export type GitHubAuthorizationResponse = components['schemas']['GitHubAuthorizationResponse']
export type ListGitHubConnectionsResponse = components['schemas']['ListGitHubConnectionsResponse']
export type ListGitHubRepositoriesResponse = components['schemas']['ListGitHubRepositoriesResponse']

type StoredGitHubConnection = ListGitHubConnectionsResponse['connections'][number]

type GitHubIntegrationConnectionJson = {
  installation_id?: number
  account?: {
    name: string
    type: 'User' | 'Organization'
    avatar: string
    installed_by_user_id: number
  }
  project_connections?: StoredGitHubConnection[]
}

function resolveGitHubOAuthClientId(): string | undefined {
  return (
    process.env.GITHUB_INTEGRATION_CLIENT_ID?.trim() ||
    process.env.GITHUB_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_GITHUB_INTEGRATION_CLIENT_ID?.trim() ||
    undefined
  )
}

function resolveGitHubOAuthClientSecret(): string | undefined {
  return (
    process.env.GITHUB_INTEGRATION_CLIENT_SECRET?.trim() ||
    process.env.GITHUB_SECRET?.trim() ||
    process.env.GITHUB_CLIENT_SECRET?.trim() ||
    undefined
  )
}

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(resolveGitHubOAuthClientId() && resolveGitHubOAuthClientSecret())
}

async function ensureGitHubAuthorizationsTable() {
  await ensureSaasTables()
  const result = await executeQuery({
    query: `
      create table if not exists saas.github_authorizations (
        id serial primary key,
        gotrue_id uuid not null unique,
        github_user_id bigint not null,
        sender_id bigint not null,
        access_token_enc text not null,
        inserted_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists github_authorizations_gotrue_idx
        on saas.github_authorizations (gotrue_id);
    `,
  })
  if (result.error) throw result.error
}

export async function getGitHubAuthorizationForUser(
  claims: Claims
): Promise<GitHubAuthorizationResponse | null> {
  await ensureGitHubAuthorizationsTable()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    id: number
    github_user_id: string
    sender_id: string
  }>({
    query: `
      select id, github_user_id::text, sender_id::text
      from saas.github_authorizations
      where gotrue_id = $1
      limit 1
    `,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  if (!row) return null
  return {
    id: row.id,
    sender_id: Number(row.sender_id),
    user_id: Number(row.github_user_id),
  }
}

export async function deleteGitHubAuthorizationForUser(claims: Claims): Promise<boolean> {
  await ensureGitHubAuthorizationsTable()
  const gotrueId = getGotrueUserId(claims)
  const result = await executeQuery<{ id: number }>({
    query: `delete from saas.github_authorizations where gotrue_id = $1 returning id`,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
  return (result.data?.length ?? 0) > 0
}

async function exchangeGitHubOAuthCode(code: string): Promise<{
  access_token: string
  token_type?: string
  scope?: string
}> {
  const clientId = resolveGitHubOAuthClientId()
  const clientSecret = resolveGitHubOAuthClientSecret()
  if (!clientId || !clientSecret) {
    throw new Error(
      'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_SECRET (or GITHUB_INTEGRATION_CLIENT_ID / GITHUB_INTEGRATION_CLIENT_SECRET).'
    )
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  })

  const payload = (await response.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'GitHub token exchange failed')
  }

  return {
    access_token: payload.access_token,
    token_type: (payload as { token_type?: string }).token_type,
    scope: (payload as { scope?: string }).scope,
  }
}

async function fetchGitHubUser(accessToken: string): Promise<{ id: number; login: string }> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  const payload = (await response.json()) as { id?: number; login?: string; message?: string }
  if (!response.ok || typeof payload.id !== 'number') {
    throw new Error(payload.message || 'Failed to load GitHub user profile')
  }
  return { id: payload.id, login: payload.login ?? 'github-user' }
}

export async function upsertGitHubAuthorizationFromCode({
  claims,
  code,
}: {
  claims: Claims
  code: string
}): Promise<void> {
  await ensureGitHubAuthorizationsTable()
  const gotrueId = getGotrueUserId(claims)
  const token = await exchangeGitHubOAuthCode(code)
  const githubUser = await fetchGitHubUser(token.access_token)
  const enc = encryptString(token.access_token)

  const result = await executeQuery({
    query: `
      insert into saas.github_authorizations (gotrue_id, github_user_id, sender_id, access_token_enc)
      values ($1, $2, $3, $4)
      on conflict (gotrue_id) do update set
        github_user_id = excluded.github_user_id,
        sender_id = excluded.sender_id,
        access_token_enc = excluded.access_token_enc,
        updated_at = now()
    `,
    parameters: [gotrueId, githubUser.id, githubUser.id, enc],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
}

async function getGitHubAccessTokenForUser(claims: Claims): Promise<string | null> {
  await ensureGitHubAuthorizationsTable()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{ access_token_enc: string }>({
    query: `select access_token_enc from saas.github_authorizations where gotrue_id = $1 limit 1`,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const enc = rows.data?.[0]?.access_token_enc
  if (!enc) return null
  return decryptString(enc)
}

async function getOrganizationIdForMember({
  claims,
  organizationId,
}: {
  claims: Claims
  organizationId: number
}): Promise<number | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{ id: number }>({
    query: `
      select o.id
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.id = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [organizationId, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data?.[0]?.id ?? null
}

async function loadGitHubIntegrationRow({
  claims,
  organizationId,
}: {
  claims: Claims
  organizationId: number
}) {
  const orgId = await getOrganizationIdForMember({ claims, organizationId })
  if (!orgId) return null
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    id: number
    connection: GitHubIntegrationConnectionJson
    inserted_at: string
    updated_at: string
  }>({
    query: `
      select id, connection, inserted_at::text, updated_at::text
      from saas.integration_connections
      where organization_id = $1 and integration_slug = 'github'
      limit 1
    `,
    parameters: [orgId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data?.[0] ?? null
}

async function saveGitHubIntegrationRow({
  claims,
  organizationId,
  connection,
}: {
  claims: Claims
  organizationId: number
  connection: GitHubIntegrationConnectionJson
}) {
  const orgId = await getOrganizationIdForMember({ claims, organizationId })
  if (!orgId) throw new Error('Organization not found')
  const gotrueId = getGotrueUserId(claims)
  const result = await executeQuery({
    query: `
      insert into saas.integration_connections (organization_id, integration_slug, connection)
      values ($1, 'github', $2::jsonb)
      on conflict (organization_id, integration_slug) do update set
        connection = excluded.connection,
        updated_at = now()
    `,
    parameters: [orgId, JSON.stringify(connection)],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
}

export async function listGitHubConnectionsForOrganization({
  claims,
  organizationId,
}: {
  claims: Claims
  organizationId: number
}): Promise<ListGitHubConnectionsResponse> {
  const row = await loadGitHubIntegrationRow({ claims, organizationId })
  return { connections: row?.connection?.project_connections ?? [] }
}

async function resolveOrganizationIdForProjectRef({
  claims,
  projectRef,
}: {
  claims: Claims
  projectRef: string
}): Promise<number | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{ organization_id: number }>({
    query: `
      select p.organization_id
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [projectRef, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data?.[0]?.organization_id ?? null
}

async function findGitHubConnectionContext({
  claims,
  connectionId,
}: {
  claims: Claims
  connectionId: number
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    organization_id: number
    connection: GitHubIntegrationConnectionJson
  }>({
    query: `
      select ic.organization_id, ic.connection
      from saas.integration_connections ic
      join saas.organization_members m on m.organization_id = ic.organization_id
      where ic.integration_slug = 'github' and m.gotrue_id = $1
    `,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  for (const row of rows.data ?? []) {
    const projectConnections = row.connection?.project_connections ?? []
    if (projectConnections.some((item) => Number(item.id) === connectionId)) {
      return { organizationId: row.organization_id, connection: row.connection }
    }
  }
  return null
}

export async function createGitHubConnectionForOrganization({
  claims,
  body,
}: {
  claims: Claims
  body: components['schemas']['CreateGitHubConnectionBody']
}): Promise<components['schemas']['CreateGitHubConnectionResponse']> {
  const organizationId = await resolveOrganizationIdForProjectRef({
    claims,
    projectRef: body.project_ref,
  })
  if (!organizationId) {
    throw new Error('Project not found or not accessible')
  }

  const profile = await getOrCreateProfile(claims)
  const existing = await loadGitHubIntegrationRow({ claims, organizationId })
  const connection = existing?.connection ?? {}
  const projectConnections = [...(connection.project_connections ?? [])]
  const nextId =
    projectConnections.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1
  const now = new Date().toISOString()

  const created: StoredGitHubConnection = {
    id: nextId,
    branch_limit: body.branch_limit ?? 50,
    inserted_at: now,
    updated_at: now,
    installation_id: body.installation_id,
    new_branch_per_pr: body.new_branch_per_pr ?? false,
    supabase_changes_only: body.supabase_changes_only ?? true,
    workdir: body.workdir ?? '/',
    project: {
      id: 0,
      name: body.project_ref,
      ref: body.project_ref,
    },
    repository: {
      id: body.repository_id,
      name: String(body.repository_id),
    },
    user: {
      id: profile.id,
      primary_email: profile.primary_email,
      username: profile.username,
    },
  }

  projectConnections.push(created)

  await saveGitHubIntegrationRow({
    claims,
    organizationId,
    connection: {
      ...connection,
      installation_id: body.installation_id,
      project_connections: projectConnections,
    },
  })

  return {
    id: created.id,
    branch_limit: created.branch_limit,
    inserted_at: created.inserted_at,
    installation_id: created.installation_id,
    new_branch_per_pr: created.new_branch_per_pr,
    supabase_changes_only: created.supabase_changes_only,
    updated_at: created.updated_at,
    workdir: created.workdir,
  }
}

export async function deleteGitHubConnectionForOrganization({
  claims,
  connectionId,
}: {
  claims: Claims
  connectionId: number
}): Promise<boolean> {
  const ctx = await findGitHubConnectionContext({ claims, connectionId })
  if (!ctx) return false
  const { organizationId } = ctx
  const existing = await loadGitHubIntegrationRow({ claims, organizationId })
  if (!existing) return false
  const connection = existing.connection ?? {}
  const before = connection.project_connections ?? []
  const after = before.filter((item) => Number(item.id) !== connectionId)
  if (after.length === before.length) return false
  await saveGitHubIntegrationRow({
    claims,
    organizationId,
    connection: { ...connection, project_connections: after },
  })
  return true
}

export async function updateGitHubConnectionForOrganization({
  claims,
  connectionId,
  patch,
}: {
  claims: Claims
  connectionId: number
  patch: components['schemas']['UpdateGitHubConnectionBody']
}): Promise<StoredGitHubConnection | null> {
  const ctx = await findGitHubConnectionContext({ claims, connectionId })
  if (!ctx) return null
  const { organizationId } = ctx
  const existing = await loadGitHubIntegrationRow({ claims, organizationId })
  if (!existing) return null
  const connection = existing.connection ?? {}
  const projectConnections = [...(connection.project_connections ?? [])]
  const index = projectConnections.findIndex((item) => Number(item.id) === connectionId)
  if (index < 0) return null

  const current = projectConnections[index]
  const updated: StoredGitHubConnection = {
    ...current,
    branch_limit: patch.branch_limit ?? current.branch_limit,
    new_branch_per_pr: patch.new_branch_per_pr ?? current.new_branch_per_pr,
    supabase_changes_only: patch.supabase_changes_only ?? current.supabase_changes_only,
    workdir: patch.workdir ?? current.workdir,
    updated_at: new Date().toISOString(),
  }
  projectConnections[index] = updated

  await saveGitHubIntegrationRow({
    claims,
    organizationId,
    connection: { ...connection, project_connections: projectConnections },
  })

  return updated
}

export async function listGitHubRepositoriesForUser(
  claims: Claims
): Promise<ListGitHubRepositoriesResponse> {
  const token = await getGitHubAccessTokenForUser(claims)
  if (!token) {
    return { partial_response_due_to_sso: false, repositories: [] }
  }

  const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  const payload = (await response.json()) as Array<{
    id?: number
    name?: string
    default_branch?: string
  }>

  if (!response.ok || !Array.isArray(payload)) {
    return { partial_response_due_to_sso: false, repositories: [] }
  }

  return {
    partial_response_due_to_sso: false,
    repositories: payload
      .filter((repo) => typeof repo.id === 'number' && repo.name)
      .map((repo) => ({
        id: repo.id as number,
        name: repo.name as string,
        default_branch: repo.default_branch ?? 'main',
        installation_id: 0,
      })),
  }
}

export async function checkGitHubBranchExists({
  claims,
  repositoryId,
  branchName,
}: {
  claims: Claims
  repositoryId: number
  branchName: string
}): Promise<components['schemas']['GitHubBranchResponse'] | null> {
  const token = await getGitHubAccessTokenForUser(claims)
  if (!token) return null

  const response = await fetch(
    `https://api.github.com/repositories/${repositoryId}/branches/${encodeURIComponent(branchName)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  if (response.status === 404) return null
  if (!response.ok) return null
  return { name: branchName }
}

export function mapOrgIntegrationProjectConnections(
  integrationRow: {
    id: number
    integration_slug: string
    connection: GitHubIntegrationConnectionJson
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
    indobase_project_ref: conn.project.ref,
    added_by: {
      username: conn.user?.username ?? addedBy.username,
      primary_email: conn.user?.primary_email ?? addedBy.primary_email,
    },
  }))
}
