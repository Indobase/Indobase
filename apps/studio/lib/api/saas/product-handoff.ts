import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getURL } from 'lib/helpers'

import { getGotrueUserId, getPrimaryEmail, getProject } from './platform'
import { executeQuery } from './query'

/**
 * One implementation of the Studio → product SSO handoff.
 *
 * Analytics, CRM, Design, Discuss, Payments, Social, Suite, and Video share this
 * implementation. Builder is deliberately NOT included — see `builder-launch.ts`.
 */

type Claims = JwtPayload & Record<string, unknown>

export const HANDOFF_PRODUCTS = [
  'analytics',
  'design',
  'discuss',
  'domains',
  'payments',
  'social',
  'suite',
  'video',
] as const

export type HandoffProduct = (typeof HANDOFF_PRODUCTS)[number]

/** Org roles permitted to open a product surface. Identical across ecosystem products today. */
export const HANDOFF_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type HandoffRole = (typeof HANDOFF_ALLOWED_ROLES)[number]

const ALLOWED_ROLE_SET = new Set<string>(HANDOFF_ALLOWED_ROLES)

export function isHandoffRole(role: string | null | undefined): role is HandoffRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

/** Handoff tokens are single-use redirects; a short life limits replay if one leaks into a log. */
export const HANDOFF_TTL_SECONDS = 60 * 5

type ProductConfig = {
  /** JWT `aud`. The receiving app rejects anything else, so this is the anti-replay boundary. */
  audience: `indobase-${HandoffProduct}`
  /** Human label used in access-denied messages. */
  label: string
  /**
   * Path the product exposes to receive the handoff. These genuinely differ per upstream fork —
   * they are not typos.
   */
  launchPath: string
  defaultBaseUrl: string
}

const PRODUCTS: Record<HandoffProduct, ProductConfig> = {
  analytics: {
    audience: 'indobase-analytics',
    label: 'Analytics',
    launchPath: '/sso/launch',
    defaultBaseUrl: 'https://analytics.indobase.in',
  },
  design: {
    audience: 'indobase-design',
    label: 'Design',
    launchPath: '/sso/launch',
    defaultBaseUrl: 'https://design.indobase.in',
  },
  discuss: {
    audience: 'indobase-discuss',
    label: 'Discuss',
    launchPath: '/sso/launch',
    defaultBaseUrl: 'https://discuss.indobase.in',
  },
  domains: {
    audience: 'indobase-domains',
    label: 'Domains',
    launchPath: '/sso/launch',
    defaultBaseUrl: 'https://domains.indobase.in',
  },
  payments: {
    audience: 'indobase-payments',
    label: 'Payments',
    launchPath: '/launch',
    defaultBaseUrl: 'https://payments.indobase.in',
  },
  social: {
    audience: 'indobase-social',
    label: 'Social',
    launchPath: '/auth/launch',
    defaultBaseUrl: 'https://social.indobase.in',
  },
  suite: {
    audience: 'indobase-suite',
    label: 'Workspace',
    launchPath: '/sso/launch',
    defaultBaseUrl: 'https://workspace.indobase.in',
  },
  video: {
    audience: 'indobase-video',
    label: 'Video',
    launchPath: '/sso/launch',
    defaultBaseUrl: 'https://video.indobase.in',
  },
}

export function getProductConfig(product: HandoffProduct): ProductConfig {
  return PRODUCTS[product]
}

export function getStudioOrigin(): string {
  return getURL() || 'https://studio.indobase.in'
}

/** `INDOBASE_DESIGN_URL` → `NEXT_PUBLIC_INDOBASE_DESIGN_URL` → the product default. */
export function resolveProductBaseUrl(product: HandoffProduct): string {
  const upper = product.toUpperCase()
  const raw =
    process.env[`INDOBASE_${upper}_URL`]?.trim() ||
    process.env[`NEXT_PUBLIC_INDOBASE_${upper}_URL`]?.trim() ||
    PRODUCTS[product].defaultBaseUrl
  return raw.replace(/\/+$/, '')
}

/**
 * Shared HMAC secret with the product.
 *
 * This chain MUST stay identical to the one every product bridge uses to verify:
 *
 *     {PRODUCT}_HANDOFF_SECRET  →  STUDIO_HANDOFF_SECRET
 *
 * It previously also fell back to `AUTH_JWT_SECRET` and then `JWT_SECRET`. Those are Studio's own
 * platform secrets and are always set in production, while no bridge has them in its chain — so
 * whenever both handoff secrets were unset, Studio silently signed with a key the product could
 * never verify. Both sides then reported themselves correctly configured, every token failed
 * verification with a bare 401, and the user was bounced to the sign-in page with no explanation.
 * A handoff secret is a *shared* secret; falling back to a value only one side can know is never
 * correct, so an unset secret must fail loudly here instead.
 *
 * Also throws on a short key — a weak secret must never silently downgrade signing.
 */
export function resolveProductHandoffSecret(product: HandoffProduct): string {
  const upper = product.toUpperCase()
  const secret =
    process.env[`${upper}_HANDOFF_SECRET`]?.trim() || process.env.STUDIO_HANDOFF_SECRET?.trim() || ''

  if (secret.length < 32) {
    throw new Error(
      `Missing/invalid ${product} handoff secret. Set ${upper}_HANDOFF_SECRET (or STUDIO_HANDOFF_SECRET) ` +
        `to the same >=32 char value on both Studio and the ${product} service.`
    )
  }

  return secret
}

export type HandoffPayload = {
  aud: `indobase-${HandoffProduct}`
  email: string
  exp: number
  iat: number
  iss: string
  organization_name: string
  organization_slug: string
  project_name: string
  project_ref: string
  role: HandoffRole
  studio_url: string
  sub: string
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** HS256 JWT. The single signing implementation for every product handoff. */
export function makeHandoffToken(
  payload: HandoffPayload | Record<string, unknown>,
  secret: string
): string {
  const headerB64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = base64Url(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const signature = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${base64Url(signature)}`
}

/**
 * The caller's role in the org, or null when they are not a member (or hold a role that cannot open
 * product surfaces). Null must be treated as denied by callers.
 */
export async function resolveProductRole(
  gotrueId: string,
  organizationSlug: string
): Promise<HandoffRole | null> {
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
  return isHandoffRole(role) ? role : null
}

export function buildProductLaunchUrl(
  product: HandoffProduct,
  opts: { baseUrl?: string; handoffToken: string; projectRef: string }
): string {
  const baseUrl = (opts.baseUrl || resolveProductBaseUrl(product)).replace(/\/+$/, '')
  const url = new URL(`${baseUrl}${PRODUCTS[product].launchPath}`)
  url.searchParams.set('project_ref', opts.projectRef)
  url.searchParams.set('from', 'studio')

  // Token rides in the fragment: fragments are not sent to the server, so it stays out of access
  // logs and Referer headers on the receiving side.
  const fragment = new URLSearchParams()
  fragment.set('token', opts.handoffToken)
  url.hash = fragment.toString()

  return url.toString()
}

/** Resolve project + role, mint the token, and build the redirect URL for a product. */
export async function getProductLaunchRedirect(
  product: HandoffProduct,
  { claims, ref }: { claims: Claims; ref: string }
) {
  const project = await getProject({ claims, ref })
  if (!project) {
    throw new Error('Project not found')
  }

  const userId = getGotrueUserId(claims)
  const role = await resolveProductRole(userId, project.organization_slug)

  if (!role) {
    const { label } = PRODUCTS[product]
    throw new Error(
      `Ask an organization owner or admin to grant you ${label} access (owner, admin, developer, or viewer).`
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const studioUrl = getStudioOrigin()

  const payload: HandoffPayload = {
    aud: PRODUCTS[product].audience,
    email: getPrimaryEmail(claims),
    exp: now + HANDOFF_TTL_SECONDS,
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

  const token = makeHandoffToken(payload, resolveProductHandoffSecret(product))

  return {
    project,
    role,
    token,
    url: buildProductLaunchUrl(product, { handoffToken: token, projectRef: project.ref }),
  }
}
