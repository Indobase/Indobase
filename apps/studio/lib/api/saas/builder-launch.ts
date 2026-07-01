import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getURL } from 'lib/helpers'

import { getPrimaryEmail, getProject, getGotrueUserId } from './platform'
import { getProjectSettingsForRef } from './settings'

type Claims = JwtPayload & Record<string, unknown>

type BuilderBackendConfig = {
  anon_key: string
  api_url: string
  auth_url: string
  project_name: string
  project_ref: string
  project_url: string
  public_env: {
    INDOBASE_ANON_KEY: string
    INDOBASE_URL: string
    NEXT_PUBLIC_INDOBASE_ANON_KEY: string
    NEXT_PUBLIC_INDOBASE_URL: string
    VITE_INDOBASE_ANON_KEY: string
    VITE_INDOBASE_URL: string
    EXPO_PUBLIC_INDOBASE_ANON_KEY: string
    EXPO_PUBLIC_INDOBASE_URL: string
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string
    NEXT_PUBLIC_SUPABASE_URL: string
    SUPABASE_ANON_KEY: string
    SUPABASE_URL: string
    VITE_SUPABASE_ANON_KEY: string
    VITE_SUPABASE_URL: string
  }
  rest_url: string
  storage_url: string
}

type BuilderHandoffPayload = {
  aud: 'indobase-builder'
  backend: BuilderBackendConfig
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
  url.searchParams.set('project_ref', opts.projectRef)
  if (opts.next && opts.next.trim()) {
    url.searchParams.set('next', opts.next.trim())
  }
  // JWT lives in the fragment so it is not sent on the HTTP request (avoids HTTP 431).
  const fragment = new URLSearchParams()
  fragment.set('token', opts.handoffToken)
  url.hash = fragment.toString()
  return url.toString()
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
      INDOBASE_ANON_KEY: anonKey,
      INDOBASE_URL: apiUrl,
      NEXT_PUBLIC_INDOBASE_ANON_KEY: anonKey,
      NEXT_PUBLIC_INDOBASE_URL: apiUrl,
      VITE_INDOBASE_ANON_KEY: anonKey,
      VITE_INDOBASE_URL: apiUrl,
      EXPO_PUBLIC_INDOBASE_ANON_KEY: anonKey,
      EXPO_PUBLIC_INDOBASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      SUPABASE_ANON_KEY: anonKey,
      SUPABASE_URL: apiUrl,
      VITE_SUPABASE_ANON_KEY: anonKey,
      VITE_SUPABASE_URL: apiUrl,
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

  const backend = buildBuilderBackendConfig({
    projectName: project.name,
    projectRef: project.ref,
    settings,
    studioUrl,
  })

  const payload: BuilderHandoffPayload = {
    aud: 'indobase-builder',
    backend,
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
