/**
 * @deprecated Use platform-api-client.ts (/api/os/v1). Studio-coupled onboard is not OS-first.
 * Server-side calls from CFOS bridge → Studio platform onboard API.
 */
import { resolveHandoffSecret } from './auth.js'

export function resolveStudioInternalUrl(): string {
  const raw =
    process.env.STUDIO_INTERNAL_URL?.trim() ||
    process.env.INDOBASE_STUDIO_INTERNAL_URL?.trim() ||
    process.env.STUDIO_URL?.trim() ||
    process.env.NEXT_PUBLIC_STUDIO_URL?.trim() ||
    ''
  if (!raw) return ''
  return raw.replace(/\/+$/, '')
}

export type OnboardStartResult =
  | { ok: true; email: string }
  | { ok: false; status: number; message: string }

export type OnboardVerifySession = {
  gotrue_id: string
  email: string
  project_ref: string
  organization_slug: string
  project_name: string
  studio_url: string
  backend?: {
    anon_key: string
    api_url: string
    auth_url: string
    project_name: string
    project_ref: string
    project_url: string
    rest_url: string
    storage_url: string
  }
}

export type OnboardVerifyResult =
  | { ok: true; session: OnboardVerifySession }
  | { ok: false; status: number; message: string }

async function studioOnboardFetch(
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const base = resolveStudioInternalUrl()
  if (!base) {
    return {
      status: 503,
      json: {
        message:
          'STUDIO_INTERNAL_URL is not configured on the bridge. Set it to the Studio service URL.',
      },
    }
  }

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch (err) {
    return {
      status: 503,
      json: {
        message: err instanceof Error ? err.message : 'Handoff secret not configured',
      },
    }
  }

  const controller = new AbortController()
  const timeoutMs = parseInt(process.env.STUDIO_ONBOARD_TIMEOUT_MS || '120000', 10)
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${base}/api/platform/builder/cfos/onboard`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-indobase-builder-cfos-secret': secret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, json }
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Studio onboarding timed out'
        : err instanceof Error
          ? err.message
          : 'Studio onboarding failed'
    return { status: 502, json: { message } }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function studioOnboardStart(input: {
  name: string
  email: string
  dpdpConsent: boolean
}): Promise<OnboardStartResult> {
  const { status, json } = await studioOnboardFetch({
    action: 'start',
    name: input.name,
    email: input.email,
    dpdpConsent: input.dpdpConsent,
  })
  if (status >= 200 && status < 300) {
    const email = typeof json?.email === 'string' ? json.email : input.email
    return { ok: true, email }
  }
  return {
    ok: false,
    status,
    message:
      (typeof json?.message === 'string' && json.message) ||
      'Could not send verification code',
  }
}

export async function studioOnboardVerify(input: {
  name: string
  email: string
  token: string
}): Promise<OnboardVerifyResult> {
  const { status, json } = await studioOnboardFetch({
    action: 'verify',
    name: input.name,
    email: input.email,
    token: input.token,
  })
  if (status >= 200 && status < 300 && json?.session && typeof json.session === 'object') {
    return { ok: true, session: json.session as OnboardVerifySession }
  }
  return {
    ok: false,
    status,
    message:
      (typeof json?.message === 'string' && json.message) ||
      'Invalid or expired verification code',
  }
}
