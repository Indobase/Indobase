/**
 * OS identity — email OTP via control-plane GoTrue (no provision at verify).
 */
import type { JwtPayload } from '@indobaseinc/indobase-js'

import { gotrueOtpUrl, gotrueVerifyUrl, resolveDirectGotrueUrl } from 'lib/gotrue-direct-url'

import { recordDataPrincipalConsent } from './data-principal'
import { createOsWorkspace, type OsWorkspaceRecord } from './os-workspace'
import { getPrimaryEmail, type Claims } from './platform'
import {
  OsIdentityError,
  validateOsIdentityStartInput,
  validateOsIdentityVerifyInput,
  type OsIdentityStartInput,
  type OsIdentityVerifyInput,
} from './os-identity-validate'

export {
  OsIdentityError,
  osIdentityErrorStatus,
  validateOsIdentityStartInput,
  validateOsIdentityVerifyInput,
  type OsIdentityStartInput,
  type OsIdentityVerifyInput,
} from './os-identity-validate'

export type OsIdentitySession = {
  gotrue_id: string
  email: string
  workspace_ref: string
  organization_slug: string
  workspace_name: string
  provision_state: OsWorkspaceRecord['provision_state']
}

function resolveControlPlaneAnonKey(): string {
  const anon =
    process.env.SUPABASE_ANON_KEY ||
    process.env.ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  if (!anon.trim()) {
    throw new OsIdentityError(
      'Missing anon key for OS identity. Set SUPABASE_ANON_KEY or ANON_KEY on the control plane.',
      503,
    )
  }
  return anon.trim()
}

function claimsFromAccessToken(accessToken: string): Claims {
  const parts = accessToken.split('.')
  if (parts.length !== 3) throw new OsIdentityError('Invalid access token', 502)
  const payload = JSON.parse(
    Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  ) as JwtPayload & Record<string, unknown>
  if (!payload.sub) throw new OsIdentityError('Access token missing subject', 502)
  return payload as Claims
}

function normalizeDisplayName(name: string, email: string): string {
  const trimmed = name.trim()
  if (trimmed) return trimmed.slice(0, 120)
  const local = email.split('@')[0]?.trim()
  return local ? local.slice(0, 120) : 'My business'
}

export async function startOsIdentityOtp(
  input: OsIdentityStartInput,
): Promise<{ ok: true; email: string }> {
  const { name, email } = validateOsIdentityStartInput(input)

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
      throw new OsIdentityError(message, response.status >= 500 ? 502 : 400)
    }

    return { ok: true, email }
  } catch (error) {
    if (error instanceof OsIdentityError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OsIdentityError('Verification code request timed out — try again.', 504)
    }
    throw new OsIdentityError(
      error instanceof Error ? error.message : 'Failed to send verification code',
      502,
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function verifyOsIdentityOtp(
  input: OsIdentityVerifyInput,
): Promise<OsIdentitySession> {
  const { name, email, token } = validateOsIdentityVerifyInput(input)

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
      throw new OsIdentityError(message, response.status >= 500 ? 502 : 400)
    }

    accessToken = typeof json?.access_token === 'string' ? json.access_token : ''
    userId =
      typeof (json?.user as { id?: string } | undefined)?.id === 'string'
        ? (json!.user as { id: string }).id
        : ''
    verifiedEmail =
      typeof (json?.user as { email?: string } | undefined)?.email === 'string'
        ? (json!.user as { email: string }).email
        : email

    if (!accessToken || !userId) {
      throw new OsIdentityError('Verification did not return a session', 502)
    }
  } catch (error) {
    if (error instanceof OsIdentityError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OsIdentityError('Verification timed out — try again with a fresh code.', 504)
    }
    throw new OsIdentityError(
      error instanceof Error ? error.message : 'Verification failed',
      502,
    )
  } finally {
    clearTimeout(timeoutId)
  }

  const claims = claimsFromAccessToken(accessToken)
  claims.email = verifiedEmail
  claims.sub = userId

  const displayName = normalizeDisplayName(name, verifiedEmail)
  const workspace = await createOsWorkspace({ claims, displayName })

  // DPDP: consent collected at /auth/start (dpdpConsent: true). Record on verify when identity is known.
  try {
    await recordDataPrincipalConsent({
      gotrueId: userId,
      email: verifiedEmail,
      consentType: 'signup_privacy',
      consented: true,
      metadata: { source: 'indobase_os_otp_verify' },
    })
    await recordDataPrincipalConsent({
      gotrueId: userId,
      email: verifiedEmail,
      consentType: 'signup_terms',
      consented: true,
      metadata: { source: 'indobase_os_otp_verify' },
    })
  } catch (consentError) {
    // Non-fatal — account + workspace already created; ops can backfill consent.
    console.error('[os-identity] Failed to record DPDP consent:', consentError)
  }

  return {
    gotrue_id: userId,
    email: getPrimaryEmail(claims) || verifiedEmail,
    workspace_ref: workspace.ref,
    organization_slug: workspace.organization_slug,
    workspace_name: workspace.name,
    provision_state: workspace.provision_state,
  }
}
