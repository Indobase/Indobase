import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getURL } from 'lib/helpers'

import { getPrimaryEmail, getProject, getGotrueUserId } from './platform'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, unknown>

/**
 * Roles allowed to open Payments. Payments controls money movement (payouts, refunds), so a
 * view-only org member must not reach it — only owners and admins. The engine re-checks `role` in
 * the handoff token, so this is defence in depth, not the only gate.
 */
const PAYMENTS_ALLOWED_ROLES = ['owner', 'admin'] as const
type PaymentsRole = (typeof PAYMENTS_ALLOWED_ROLES)[number]

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
  /** Caller's org role, propagated so the engine grants matching Payments access (owner/admin only). */
  role: PaymentsRole
  studio_url: string
  sub: string
}

/**
 * The caller's role in the org, or null if they are not an owner/admin (or not a member).
 * Deliberately returns only the privileged roles — a plain member resolves to null and is denied.
 */
async function resolvePaymentsRole(gotrueId: string, organizationSlug: string): Promise<PaymentsRole | null> {
  if (!gotrueId || !organizationSlug) return null
  const rows = await executeQuery<{ role: string }>({
    query: `
      select m.role
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1 and m.gotrue_id = $2 and m.role in ('owner', 'admin')
      limit 1
    `,
    parameters: [organizationSlug, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const role = rows.data?.[0]?.role
  return role === 'owner' || role === 'admin' ? role : null
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

  // Gate on org role: only owners/admins may open Payments (money movement). A member is denied
  // here — before a token is even minted — and the engine re-checks the role claim as well.
  const role = await resolvePaymentsRole(userId, project.organization_slug)
  if (!role) {
    throw new Error('Payments is available to organization owners and admins only')
  }

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
    role,
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
