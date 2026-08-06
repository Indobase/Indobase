import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getURL } from 'lib/helpers'

import {
  buildBuilderBackendConfig,
  BUILDER_HANDOFF_CONNECT_TTL_SECONDS,
  BUILDER_HANDOFF_TTL_SECONDS,
  getStudioOrigin,
} from './builder-launch'
import { getPrimaryEmail, getProject, getGotrueUserId } from './platform'
import { getProjectSettingsForRef } from './settings'

type Claims = JwtPayload & Record<string, unknown>

/**
 * Builder v2 PoC — Cloudflare OS shell behind an Indobase SSO bridge.
 * Enable with BUILDER_USE_CFOS=1 (or true). Shares BUILDER_HANDOFF_SECRET by default.
 */
export const BUILDER_CFOS_AUDIENCE = 'indobase-builder-cfos' as const

export function isBuilderCfosEnabled(): boolean {
  const raw = (process.env.BUILDER_USE_CFOS || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export function resolveBuilderCfosBaseUrl(): string {
  const raw =
    process.env.BUILDER_CFOS_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_BUILDER_CFOS_APP_URL?.trim() ||
    'http://127.0.0.1:8791'
  return raw.replace(/\/+$/, '')
}

export function resolveBuilderCfosHandoffSecret(): string {
  const secret =
    process.env.BUILDER_CFOS_HANDOFF_SECRET?.trim() ||
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    process.env.AUTH_JWT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    ''

  if (secret.length < 32) {
    throw new Error('Missing/invalid builder CFOS handoff secret (must be >= 32 chars)')
  }

  return secret
}

function base64Url(input: Buffer | string) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function makeBuilderCfosHandoffToken(payload: Record<string, unknown>, secret: string): string {
  const headerB64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = base64Url(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const signature = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${base64Url(signature)}`
}

export function buildBuilderCfosLaunchUrl(opts: {
  baseUrl?: string
  handoffToken: string
  projectRef: string
  next?: string
}) {
  const baseUrl = (opts.baseUrl || resolveBuilderCfosBaseUrl()).replace(/\/+$/, '')
  const url = new URL(`${baseUrl}/sso/launch`)
  url.searchParams.set('project_ref', opts.projectRef)
  if (opts.next && opts.next.trim()) {
    url.searchParams.set('next', opts.next.trim())
  }
  const fragment = new URLSearchParams()
  fragment.set('token', opts.handoffToken)
  url.hash = fragment.toString()
  return url.toString()
}

export async function getBuilderCfosLaunchRedirect({
  claims,
  connectFlow,
  ref,
  next,
}: {
  claims: Claims
  connectFlow?: boolean
  ref: string
  next?: string
}) {
  const project = await getProject({ claims, ref })
  if (!project) {
    throw new Error('Project not found')
  }

  const now = Math.floor(Date.now() / 1000)
  const studioUrl = getStudioOrigin() || getURL() || 'https://studio.indobase.in'
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

  const payload = {
    aud: BUILDER_CFOS_AUDIENCE,
    backend,
    email: getPrimaryEmail(claims),
    exp: now + (connectFlow ? BUILDER_HANDOFF_CONNECT_TTL_SECONDS : BUILDER_HANDOFF_TTL_SECONDS),
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

  const token = makeBuilderCfosHandoffToken(payload, resolveBuilderCfosHandoffSecret())

  return {
    backend,
    project,
    runtime: 'cfos' as const,
    token,
    url: buildBuilderCfosLaunchUrl({
      handoffToken: token,
      projectRef: project.ref,
      next,
    }),
  }
}
