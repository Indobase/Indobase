import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getURL } from 'lib/helpers'

import {
  emailWorkspaceIdForProjectRef,
  isEmailRole,
  type EmailRole,
} from './email-launch-shared'
import { getPrimaryEmail, getProject, getGotrueUserId } from './platform'
import { executeQuery } from './query'

export {
  EMAIL_ALLOWED_ROLES,
  EMAIL_ROLE_DENIED_CODE,
  emailWorkspaceIdForProjectRef,
  isEmailRole,
  isEmailRoleDeniedMessage,
  type EmailRole,
} from './email-launch-shared'

type Claims = JwtPayload & Record<string, unknown>

export type EmailHandoffPayload = {
  aud: 'indobase-email'
  email: string
  exp: number
  iat: number
  iss: string
  organization_name: string
  organization_slug: string
  project_name: string
  project_ref: string
  role: EmailRole
  studio_url: string
  sub: string
}

export async function resolveEmailRole(
  gotrueId: string,
  organizationSlug: string
): Promise<EmailRole | null> {
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
  return isEmailRole(role) ? role : null
}

function base64Url(input: Buffer | string) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function resolveEmailBaseUrl(): string {
  const raw =
    process.env.INDOBASE_EMAIL_URL?.trim() ||
    process.env.NEXT_PUBLIC_INDOBASE_EMAIL_URL?.trim() ||
    'https://email.indobase.in'
  return raw.replace(/\/+$/, '')
}

/**
 * Shared HMAC secret with Indobase Email (`STUDIO_HANDOFF_SECRET` / `EMAIL_HANDOFF_SECRET`).
 */
export function resolveEmailHandoffSecret(): string {
  const secret =
    process.env.EMAIL_HANDOFF_SECRET?.trim() ||
    process.env.STUDIO_HANDOFF_SECRET?.trim() ||
    process.env.PAYMENTS_HANDOFF_SECRET?.trim() ||
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    process.env.AUTH_JWT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    ''

  if (secret.length < 32) {
    throw new Error('Missing/invalid email handoff secret (must be >= 32 chars)')
  }

  return secret
}

export function getStudioOrigin(): string {
  return getURL() || 'https://studio.indobase.in'
}

export const EMAIL_HANDOFF_TTL_SECONDS = 60 * 5

export function makeEmailHandoffToken(
  payload: EmailHandoffPayload | Record<string, unknown>,
  secret: string
): string {
  const headerB64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = base64Url(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const signature = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${base64Url(signature)}`
}

export function buildEmailLaunchUrl(opts: {
  baseUrl?: string
  handoffToken: string
  projectRef: string
}) {
  const baseUrl = (opts.baseUrl || resolveEmailBaseUrl()).replace(/\/+$/, '')
  const url = new URL(`${baseUrl}/console/launch`)
  url.searchParams.set('project_ref', opts.projectRef)
  url.searchParams.set('from', 'studio')
  const fragment = new URLSearchParams()
  fragment.set('token', opts.handoffToken)
  url.hash = fragment.toString()
  return url.toString()
}

export async function getEmailLaunchRedirect({
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

  const role = await resolveEmailRole(userId, project.organization_slug)
  if (!role) {
    throw new Error(
      'Ask an organization owner or admin to grant you Email access (owner, admin, developer, or viewer).'
    )
  }

  const emailWorkspaceId = emailWorkspaceIdForProjectRef(project.ref)

  const payload: EmailHandoffPayload = {
    aud: 'indobase-email',
    email: getPrimaryEmail(claims),
    exp: now + EMAIL_HANDOFF_TTL_SECONDS,
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

  const token = makeEmailHandoffToken(payload, resolveEmailHandoffSecret())
  return {
    project,
    emailWorkspaceId,
    role,
    token,
    url: buildEmailLaunchUrl({
      handoffToken: token,
      projectRef: project.ref,
    }),
  }
}
