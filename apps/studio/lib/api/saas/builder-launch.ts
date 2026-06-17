import crypto from 'node:crypto'

import type { JwtPayload } from 'indobase-js'

import { getURL } from 'lib/helpers'

import { executeQuery } from './query'
import { getPrimaryEmail, getProject, getGotrueUserId } from './platform'
import { getProjectSettingsForRef } from './settings'
import { decryptString } from './util'

type Claims = JwtPayload & Record<string, unknown>

type BuilderBackendConfig = {
  anon_key: string
  api_url: string
  auth_url: string
  project_name: string
  project_ref: string
  project_url: string
  public_env: {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string
    NEXT_PUBLIC_SUPABASE_URL: string
    SUPABASE_ANON_KEY: string
    SUPABASE_URL: string
  }
  rest_url: string
  storage_url: string
}

type BuilderHandoffPayload = {
  anonKey: string
  aud: 'indobase-builder'
  backend: BuilderBackendConfig
  dbUrl: string
  email: string
  exp: number
  iat: number
  iss: string
  orgId: number
  organization_slug: string
  project_name: string
  project_ref: string
  projectRef: string
  studio_url: string
  sub: string
  userId: string
}

function base64Url(input: Buffer | string) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function resolveBuilderBaseUrl(): string {
  const raw =
    process.env.BUILDER_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_BUILDER_APP_URL?.trim() ||
    'https://builder.indobase.in'
  return raw.replace(/\/+$/, '')
}

export function resolveBuilderHandoffSecret(): string {
  const secret =
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    process.env.AUTH_JWT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    ''

  if (secret.length < 32) {
    throw new Error('Missing/invalid builder handoff secret (must be >= 32 chars)')
  }

  return secret
}

export function getStudioOrigin(): string {
  return getURL() || 'https://studio.indobase.in'
}

export function makeBuilderHandoffToken(payload: BuilderHandoffPayload, secret: string): string {
  const headerB64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = base64Url(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const signature = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${base64Url(signature)}`
}

export function buildBuilderLaunchUrl(opts: {
  baseUrl?: string
  handoffToken: string
  projectRef: string
  next?: string
}) {
  const baseUrl = (opts.baseUrl || resolveBuilderBaseUrl()).replace(/\/+$/, '')
  const url = new URL(`${baseUrl}/launch`)
  url.searchParams.set('token', opts.handoffToken)
  // Preserve the previous query name during rollout so existing Builder consumers keep working.
  url.searchParams.set('handoff', opts.handoffToken)
  url.searchParams.set('project_ref', opts.projectRef)
  if (opts.next && opts.next.trim()) {
    url.searchParams.set('next', opts.next.trim())
  }
  return url.toString()
}

function resolveSharedDbUrl() {
  if (!process.env.POSTGRES_PASSWORD || !process.env.POSTGRES_HOST || !process.env.POSTGRES_DB) {
    return null
  }

  return `postgres://${process.env.POSTGRES_USER ?? 'postgres'}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB}`
}

function normalizeApiOrigin(protocol: string | undefined, endpoint: string | undefined) {
  const proto = (protocol || 'https').replace(/:$/, '')
  const host = (endpoint || '').trim()
  if (!host) return ''
  return `${proto}://${host}`
}

function getAnonKeyFromSettings(settings: Awaited<ReturnType<typeof getProjectSettingsForRef>>) {
  const anon = settings?.service_api_keys?.find((entry) => entry.tags === 'anon')?.api_key?.trim() || ''
  if (!anon) throw new Error('Project anon key is missing')
  return anon
}

async function getProjectDatabaseUrl(opts: { claims: Claims; ref: string }) {
  const gotrueId = getGotrueUserId(opts.claims)
  const row = await executeQuery<{
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [opts.ref, gotrueId],
    actorId: gotrueId,
  })

  if (row.error) throw row.error
  if (!row.data?.length) {
    throw new Error('Project database URL not found')
  }

  const project = row.data[0]
  const tenantDbUrl =
    project?.connection_string_enc?.trim() ? decryptString(project.connection_string_enc) : project?.connection_string
  const effectiveDbUrl = tenantDbUrl?.trim() ? tenantDbUrl : resolveSharedDbUrl()

  if (!effectiveDbUrl) {
    throw new Error('Project database URL is missing')
  }

  return effectiveDbUrl
}

export function buildBuilderBackendConfig(opts: {
  projectName: string
  projectRef: string
  settings: NonNullable<Awaited<ReturnType<typeof getProjectSettingsForRef>>>
  studioUrl: string
}) {
  const apiUrl = normalizeApiOrigin(opts.settings.app_config?.protocol, opts.settings.app_config?.endpoint)
  if (!apiUrl) {
    throw new Error('Project API URL is missing')
  }

  const anonKey = getAnonKeyFromSettings(opts.settings)

  return {
    anon_key: anonKey,
    api_url: apiUrl,
    auth_url: `${apiUrl}/auth/v1`,
    project_name: opts.projectName,
    project_ref: opts.projectRef,
    project_url: `${opts.studioUrl.replace(/\/+$/, '')}/project/${opts.projectRef}/backend`,
    public_env: {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      SUPABASE_ANON_KEY: anonKey,
      SUPABASE_URL: apiUrl,
    },
    rest_url: `${apiUrl}/rest/v1/`,
    storage_url: `${apiUrl}/storage/v1`,
  } satisfies BuilderBackendConfig
}

export async function getBuilderLaunchRedirect({
  claims,
  ref,
  next,
}: {
  claims: Claims
  ref: string
  next?: string
}) {
  const project = await getProject({ claims, ref })
  if (!project) {
    throw new Error('Project not found')
  }

  const now = Math.floor(Date.now() / 1000)
  const studioUrl = getStudioOrigin()
  const userId = getGotrueUserId(claims)
  const settings = await getProjectSettingsForRef({ claims, ref })
  if (!settings) {
    throw new Error('Project settings not found')
  }
  const dbUrl = await getProjectDatabaseUrl({ claims, ref })

  const backend = buildBuilderBackendConfig({
    projectName: project.name,
    projectRef: project.ref,
    settings,
    studioUrl,
  })

  const payload: BuilderHandoffPayload = {
    anonKey: backend.anon_key,
    aud: 'indobase-builder',
    backend,
    dbUrl,
    email: getPrimaryEmail(claims),
    exp: now + 60 * 5,
    iat: now,
    iss: studioUrl,
    orgId: project.organization_id,
    organization_slug: project.organization_slug,
    project_name: project.name,
    project_ref: project.ref,
    projectRef: project.ref,
    studio_url: studioUrl,
    sub: userId,
    userId,
  }

  const token = makeBuilderHandoffToken(payload, resolveBuilderHandoffSecret())
  return {
    backend,
    project,
    token,
    url: buildBuilderLaunchUrl({
      handoffToken: token,
      projectRef: project.ref,
      next,
    }),
  }
}
