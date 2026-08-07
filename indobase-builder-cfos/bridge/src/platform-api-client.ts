/**
 * Bridge → headless Platform API client (Indobase OS Phase 1).
 */
import {
  OS_API_SECRET_HEADER,
  PlatformApiRoutes,
  type DeployPublishResponse,
  type OsWorkspaceSession,
  type RuntimeEnsureResponse,
} from '@indobase/platform-api'

import { resolveHandoffSecret } from './auth.js'

export function resolvePlatformApiUrl(): string {
  const raw =
    process.env.PLATFORM_API_URL?.trim() ||
    process.env.STUDIO_INTERNAL_URL?.trim() ||
    process.env.INDOBASE_STUDIO_INTERNAL_URL?.trim() ||
    process.env.STUDIO_URL?.trim() ||
    ''
  if (!raw) return ''
  return raw.replace(/\/+$/, '')
}

async function platformFetch(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const base = resolvePlatformApiUrl()
  if (!base) {
    return {
      status: 503,
      json: {
        message:
          'PLATFORM_API_URL is not configured on the bridge. Set it to the control plane base URL.',
      },
    }
  }

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch (err) {
    return {
      status: 503,
      json: { message: err instanceof Error ? err.message : 'Handoff secret not configured' },
    }
  }

  const controller = new AbortController()
  const timeoutMs = parseInt(process.env.PLATFORM_API_TIMEOUT_MS || '120000', 10)
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        [OS_API_SECRET_HEADER]: secret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, json }
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Platform API timed out'
        : err instanceof Error
          ? err.message
          : 'Platform API request failed'
    return { status: 502, json: { message } }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function platformOtpStart(input: {
  name: string
  email: string
  dpdpConsent: boolean
}): Promise<{ ok: true; email: string } | { ok: false; status: number; message: string }> {
  const { status, json } = await platformFetch(PlatformApiRoutes.identityOtpStart, {
    name: input.name,
    email: input.email,
    dpdpConsent: input.dpdpConsent,
  })
  if (status >= 200 && status < 300) {
    return { ok: true, email: typeof json?.email === 'string' ? json.email : input.email }
  }
  return {
    ok: false,
    status,
    message: (typeof json?.message === 'string' && json.message) || 'Could not send verification code',
  }
}

export async function platformOtpVerify(input: {
  name: string
  email: string
  token: string
}): Promise<
  | { ok: true; session: OsWorkspaceSession }
  | { ok: false; status: number; message: string }
> {
  const { status, json } = await platformFetch(PlatformApiRoutes.identityOtpVerify, {
    name: input.name,
    email: input.email,
    token: input.token,
  })
  if (status >= 200 && status < 300 && json?.session && typeof json.session === 'object') {
    return { ok: true, session: json.session as OsWorkspaceSession }
  }
  return {
    ok: false,
    status,
    message:
      (typeof json?.message === 'string' && json.message) || 'Invalid or expired verification code',
  }
}

export async function platformRuntimeEnsure(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  capability: string
}): Promise<RuntimeEnsureResponse & { status?: number }> {
  const { status, json } = await platformFetch(PlatformApiRoutes.runtimeEnsure, {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
    capability: input.capability,
  })
  if (json && typeof json === 'object') {
    return { ...(json as RuntimeEnsureResponse), status }
  }
  return {
    ok: false,
    capability: input.capability,
    provision_state: 'none',
    message: 'Runtime ensure failed',
    status,
  }
}

export async function platformDeployPublish(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  reason?: string
}): Promise<DeployPublishResponse & { status?: number }> {
  const { status, json } = await platformFetch(PlatformApiRoutes.deployPublish, {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
    reason: input.reason || 'os_launch',
  })
  if (json && typeof json === 'object') {
    return { ...(json as DeployPublishResponse), status }
  }
  return {
    ok: false,
    status: 'failed',
    message: 'Could not go live — try Launch Business again.',
  }
}
