import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getURL } from 'lib/helpers'

import { isFinanceRole, type FinanceRole } from './finance-launch-shared'
import { getPrimaryEmail, getProject, getGotrueUserId } from './platform'
import { executeQuery } from './query'

export {
  FINANCE_ALLOWED_ROLES,
  FINANCE_ROLE_DENIED_CODE,
  isFinanceRole,
  isFinanceRoleDeniedMessage,
  type FinanceRole,
} from './finance-launch-shared'

type Claims = JwtPayload & Record<string, unknown>

export type FinanceHandoffPayload = {
  aud: 'indobase-finance'
  email: string
  exp: number
  iat: number
  iss: string
  organization_name: string
  organization_slug: string
  project_name: string
  project_ref: string
  role: FinanceRole
  studio_url: string
  sub: string
}

export async function resolveFinanceRole(
  gotrueId: string,
  organizationSlug: string
): Promise<FinanceRole | null> {
  if (!gotrueId || !organizationSlug) return null
  const rows = await executeQuery<{ role: string }>({
    query: `
      select m.role
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer', 'viewer')
      limit 1
    `,
    parameters: [organizationSlug, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const role = rows.data?.[0]?.role
  return isFinanceRole(role) ? role : null
}

function base64Url(input: Buffer | string) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function resolveFinanceBaseUrl(): string {
  const raw =
    process.env.INDOBASE_FINANCE_URL?.trim() ||
    process.env.NEXT_PUBLIC_INDOBASE_FINANCE_URL?.trim() ||
    'https://finance.indobase.in'
  return raw.replace(/\/+$/, '')
}

/**
 * Shared HMAC secret with Indobase Finance (`FINANCE_HANDOFF_SECRET` on the
 * finance sso-shim / `STUDIO_HANDOFF_SECRET`).
 */
export function resolveFinanceHandoffSecret(): string {
  const secret =
    // Product secret, then the shared Studio secret, then platform JWT secrets. Cross-product
    // fallbacks (EMAIL_/SOCIAL_/PAYMENTS_HANDOFF_SECRET) are deliberately NOT inherited from the
    // module this was derived from: falling back to another product's key can hand two products the
    // same signing secret, which defeats the per-product `aud` boundary.
    process.env.FINANCE_HANDOFF_SECRET?.trim() ||
    process.env.STUDIO_HANDOFF_SECRET?.trim() ||
    process.env.AUTH_JWT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    ''

  if (secret.length < 32) {
    throw new Error('Missing/invalid finance handoff secret (must be >= 32 chars)')
  }

  return secret
}

export function getStudioOrigin(): string {
  return getURL() || 'https://studio.indobase.in'
}

export const FINANCE_HANDOFF_TTL_SECONDS = 60 * 5

export function makeFinanceHandoffToken(
  payload: FinanceHandoffPayload | Record<string, unknown>,
  secret: string
): string {
  const headerB64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = base64Url(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const signature = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${base64Url(signature)}`
}

export function buildFinanceLaunchUrl(opts: {
  baseUrl?: string
  handoffToken: string
  projectRef: string
}) {
  const baseUrl = (opts.baseUrl || resolveFinanceBaseUrl()).replace(/\/+$/, '')
  const url = new URL(`${baseUrl}/sso/launch`)
  url.searchParams.set('project_ref', opts.projectRef)
  url.searchParams.set('from', 'studio')
  const fragment = new URLSearchParams()
  fragment.set('token', opts.handoffToken)
  url.hash = fragment.toString()
  return url.toString()
}

export async function getFinanceLaunchRedirect({
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

  const role = await resolveFinanceRole(userId, project.organization_slug)
  if (!role) {
    throw new Error(
      'Ask an organization owner or admin to grant you Finance access (owner, admin, developer, or viewer).'
    )
  }

  const payload: FinanceHandoffPayload = {
    aud: 'indobase-finance',
    email: getPrimaryEmail(claims),
    exp: now + FINANCE_HANDOFF_TTL_SECONDS,
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

  const token = makeFinanceHandoffToken(payload, resolveFinanceHandoffSecret())
  return {
    project,
    role,
    token,
    url: buildFinanceLaunchUrl({
      handoffToken: token,
      projectRef: project.ref,
    }),
  }
}
