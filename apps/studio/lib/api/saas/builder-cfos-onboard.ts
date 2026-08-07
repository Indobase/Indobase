/**
 * @deprecated Use os-identity.ts + /api/os/v1. Provisioning at signup is not OS-first.
 */
import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { makeRandomString } from 'lib/helpers'
import { gotrueOtpUrl, gotrueVerifyUrl, resolveDirectGotrueUrl } from 'lib/gotrue-direct-url'

import {
  buildBuilderBackendConfig,
  getStudioOrigin,
} from './builder-launch'
import {
  buildBuilderCfosLaunchUrl,
  makeBuilderCfosHandoffToken,
  resolveBuilderCfosHandoffSecret,
} from './builder-cfos-launch'
import { recordDataPrincipalConsent } from './data-principal'
import {
  createOrganization,
  createProject,
  getPrimaryEmail,
  getProject,
  getGotrueUserId,
  listOrganizations,
  listProjects,
  type Claims,
} from './platform'
import { getProjectSettingsForRef } from './settings'

export type BuilderCfosOnboardStartInput = {
  name: string
  email: string
  dpdpConsent?: boolean
}

export type BuilderCfosOnboardVerifyInput = {
  name: string
  email: string
  token: string
}

export type BuilderCfosOnboardSession = {
  gotrue_id: string
  email: string
  project_ref: string
  organization_slug: string
  project_name: string
  studio_url: string
  backend: ReturnType<typeof buildBuilderBackendConfig>
  handoff_token: string
  launch_url: string
}

function resolveControlPlaneAnonKey(): string {
  const anon =
    process.env.SUPABASE_ANON_KEY ||
    process.env.ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  if (!anon.trim()) {
    throw new Error(
      'Missing anon key for OS onboarding. Set SUPABASE_ANON_KEY or ANON_KEY on Studio.',
    )
  }
  return anon.trim()
}

function claimsFromAccessToken(accessToken: string): Claims {
  const parts = accessToken.split('.')
  if (parts.length !== 3) throw new Error('Invalid access token')
  const payload = JSON.parse(
    Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  ) as JwtPayload & Record<string, unknown>
  if (!payload.sub) throw new Error('Access token missing subject')
  return payload as Claims
}

function normalizeDisplayName(name: string, email: string): string {
  const trimmed = name.trim()
  if (trimmed) return trimmed.slice(0, 120)
  const local = email.split('@')[0]?.trim()
  return local ? local.slice(0, 120) : 'My business'
}

function defaultProjectName(displayName: string): string {
  const base = displayName.trim() || 'My business'
  const label = base.endsWith(' workspace') ? base : `${base} workspace`
  return label.slice(0, 64)
}

export function verifyBuilderCfosBridgeSecret(provided: string | undefined | null): boolean {
  if (!provided?.trim()) return false
  try {
    const expected = resolveBuilderCfosHandoffSecret()
    const actual = provided.trim()
    if (actual.length !== expected.length) return false
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function startBuilderCfosOnboard(
  input: BuilderCfosOnboardStartInput,
): Promise<{ ok: true; email: string }> {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name || !email.includes('@')) {
    throw new Error('name and valid email are required')
  }
  if (input.dpdpConsent !== true) {
    throw new Error(
      'You must accept the Privacy Policy and Terms of Service to continue (DPDP consent required).',
    )
  }

  const gotrueBase = resolveDirectGotrueUrl()
  const otpUrl = gotrueOtpUrl(gotrueBase)
  const anonKey = resolveControlPlaneAnonKey()
  const timeoutMs = parseInt(process.env.GOTRUE_OTP_TIMEOUT_MS || '15000', 10)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(otpUrl, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        create_user: true,
        data: { full_name: name },
      }),
      signal: controller.signal,
    })

    const text = await response.text()
    let json: Record<string, unknown> | null = null
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null
    } catch {
      json = null
    }

    if (!response.ok) {
      const message =
        (typeof json?.msg === 'string' && json.msg) ||
        (typeof json?.message === 'string' && json.message) ||
        (typeof json?.error_description === 'string' && json.error_description) ||
        `Failed to send verification code (${response.status})`
      throw new Error(message)
    }

    return { ok: true, email }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function ensureOrgAndProject(claims: Claims, displayName: string) {
  const orgs = await listOrganizations({ claims, limit: 5 })
  let orgSlug = orgs[0]?.slug

  if (!orgSlug) {
    const created = await createOrganization({
      claims,
      body: {
        name: displayName,
        kind: 'PERSONAL',
        tier: 'free',
      },
    })
    orgSlug = created.slug
  }

  const { projects } = await listProjects({ claims, limit: 5 })
  if (projects.length > 0) {
    return projects[0]
  }

  return createProject({
    claims,
    body: {
      name: defaultProjectName(displayName),
      organization_slug: orgSlug,
      db_pass: makeRandomString(24),
      cloud_provider: 'AWS',
    },
  })
}

export async function verifyBuilderCfosOnboard(
  input: BuilderCfosOnboardVerifyInput,
): Promise<BuilderCfosOnboardSession> {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const token = input.token.trim()
  if (!name || !email.includes('@') || !token) {
    throw new Error('name, email, and verification code are required')
  }

  const gotrueBase = resolveDirectGotrueUrl()
  const verifyUrl = gotrueVerifyUrl(gotrueBase)
  const timeoutMs = parseInt(process.env.GOTRUE_VERIFY_TIMEOUT_MS || '8000', 10)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let accessToken: string
  let userId: string
  let verifiedEmail: string

  try {
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, type: 'email' }),
      signal: controller.signal,
    })

    const text = await response.text()
    let json: Record<string, unknown> | null = null
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null
    } catch {
      json = null
    }

    if (!response.ok) {
      const message =
        (typeof json?.msg === 'string' && json.msg) ||
        (typeof json?.message === 'string' && json.message) ||
        (typeof json?.error_description === 'string' && json.error_description) ||
        'Invalid or expired verification code'
      throw new Error(message)
    }

    accessToken =
      typeof json?.access_token === 'string' ? json.access_token : ''
    userId =
      typeof (json?.user as { id?: string } | undefined)?.id === 'string'
        ? (json!.user as { id: string }).id
        : ''
    verifiedEmail =
      typeof (json?.user as { email?: string } | undefined)?.email === 'string'
        ? (json!.user as { email: string }).email
        : email

    if (!accessToken || !userId) {
      throw new Error('Verification did not return a session')
    }
  } finally {
    clearTimeout(timeoutId)
  }

  const claims = claimsFromAccessToken(accessToken)
  claims.email = verifiedEmail
  claims.sub = userId

  const displayName = normalizeDisplayName(name, verifiedEmail)
  const projectRow = await ensureOrgAndProject(claims, displayName)
  const project = await getProject({ claims, ref: projectRow.ref })
  if (!project) throw new Error('Project not found after onboarding')

  const studioUrl = getStudioOrigin() || 'https://studio.indobase.in'
  const settings = await getProjectSettingsForRef({ claims, ref: project.ref })
  if (!settings) throw new Error('Project settings not found')

  const backend = buildBuilderBackendConfig({
    projectName: project.name,
    projectRef: project.ref,
    settings,
    studioUrl,
  })

  const now = Math.floor(Date.now() / 1000)
  const handoffPayload = {
    aud: 'indobase-builder-cfos' as const,
    backend,
    email: getPrimaryEmail(claims) || verifiedEmail,
    exp: now + 60 * 60 * 12,
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

  const handoffToken = makeBuilderCfosHandoffToken(
    handoffPayload,
    resolveBuilderCfosHandoffSecret(),
  )

  try {
    await recordDataPrincipalConsent({
      gotrueId: userId,
      email: verifiedEmail,
      consentType: 'signup_privacy',
      consented: true,
      metadata: { source: 'builder_cfos_onboard' },
    })
    await recordDataPrincipalConsent({
      gotrueId: userId,
      email: verifiedEmail,
      consentType: 'signup_terms',
      consented: true,
      metadata: { source: 'builder_cfos_onboard' },
    })
  } catch (consentError) {
    console.error('[builder-cfos-onboard] Failed to record DPDP consent:', consentError)
  }

  return {
    gotrue_id: userId,
    email: getPrimaryEmail(claims) || verifiedEmail,
    project_ref: project.ref,
    organization_slug: project.organization_slug,
    project_name: project.name,
    studio_url: studioUrl,
    backend,
    handoff_token: handoffToken,
    launch_url: buildBuilderCfosLaunchUrl({
      handoffToken,
      projectRef: project.ref,
      next: '/',
    }),
  }
}
