import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getURL } from 'lib/helpers'

import { getPrimaryEmail, getProject, getGotrueUserId } from './platform'

type Claims = JwtPayload & Record<string, unknown>

export type PaymentsHandoffPayload = {
  aud: 'indobase-payments'
  email: string
  exp: number
  iat: number
  iss: string
  organization_name: string
  organization_slug: string
  project_name: string
  project_ref: string
  studio_url: string
  sub: string
}

function base64Url(input: Buffer | string) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function resolvePaymentsBaseUrl(): string {
  const raw =
    process.env.INDOBASE_PAYMENTS_URL?.trim() ||
    process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_URL?.trim() ||
    'https://payments.indobase.in'
  return raw.replace(/\/+$/, '')
}

/**
 * Shared HMAC secret with Payments (`STUDIO_HANDOFF_SECRET` / `PAYMENTS_HANDOFF_SECRET`).
 * Falls back to Builder handoff secret so one ops secret can cover both products.
 */
export function resolvePaymentsHandoffSecret(): string {
  const secret =
    process.env.PAYMENTS_HANDOFF_SECRET?.trim() ||
    process.env.STUDIO_HANDOFF_SECRET?.trim() ||
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    process.env.AUTH_JWT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    ''

  if (secret.length < 32) {
    throw new Error('Missing/invalid payments handoff secret (must be >= 32 chars)')
  }

  return secret
}

export function getStudioOrigin(): string {
  return getURL() || 'https://studio.indobase.in'
}

export const PAYMENTS_HANDOFF_TTL_SECONDS = 60 * 5

export function makePaymentsHandoffToken(payload: PaymentsHandoffPayload, secret: string): string {
  const headerB64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = base64Url(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const signature = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${base64Url(signature)}`
}

export function buildPaymentsLaunchUrl(opts: {
  baseUrl?: string
  handoffToken: string
  projectRef: string
}) {
  const baseUrl = (opts.baseUrl || resolvePaymentsBaseUrl()).replace(/\/+$/, '')
  const url = new URL(`${baseUrl}/launch`)
  url.searchParams.set('project_ref', opts.projectRef)
  url.searchParams.set('from', 'studio')
  // JWT in the fragment so it is not sent on the first HTML request (avoids proxy logs / HTTP 431).
  const fragment = new URLSearchParams()
  fragment.set('token', opts.handoffToken)
  url.hash = fragment.toString()
  return url.toString()
}

export async function getPaymentsLaunchRedirect({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const project = await getProject({ claims, ref })
  if (!project) {
    throw new Error('Project not found')
  }

  const now = Math.floor(Date.now() / 1000)
  const studioUrl = getStudioOrigin()
  const userId = getGotrueUserId(claims)

  const payload: PaymentsHandoffPayload = {
    aud: 'indobase-payments',
    email: getPrimaryEmail(claims),
    exp: now + PAYMENTS_HANDOFF_TTL_SECONDS,
    iat: now,
    iss: studioUrl,
    organization_name: project.organization_slug,
    organization_slug: project.organization_slug,
    project_name: project.name,
    project_ref: project.ref,
    studio_url: studioUrl,
    sub: userId,
  }

  const token = makePaymentsHandoffToken(payload, resolvePaymentsHandoffSecret())
  return {
    project,
    token,
    url: buildPaymentsLaunchUrl({
      handoffToken: token,
      projectRef: project.ref,
    }),
  }
}
