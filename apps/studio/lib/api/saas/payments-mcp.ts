import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'

import {
  getStudioOrigin,
  makePaymentsHandoffToken,
  resolvePaymentsBaseUrl,
  resolvePaymentsHandoffSecret,
  resolvePaymentsRole,
  type PaymentsRole,
} from './payments-launch'
import { getGotrueUserId, getPrimaryEmail, getProject } from './platform'

type Claims = JwtPayload & Record<string, unknown>

export const PAYMENTS_MCP_TOKEN_TTL_SECONDS = 60 * 15

export type PaymentsMcpTokenPayload = {
  aud: 'indobase-payments-mcp'
  email: string
  exp: number
  iat: number
  iss: string
  organization_name: string
  organization_slug: string
  project_name: string
  project_ref: string
  role: PaymentsRole
  studio_url: string
  sub: string
}

export function resolvePaymentsApiBaseUrl(): string {
  const explicit =
    process.env.INDOBASE_PAYMENTS_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_API_URL?.trim() ||
    ''
  if (explicit) {
    return explicit.replace(/\/+$/, '')
  }

  const web = resolvePaymentsBaseUrl()
  try {
    const url = new URL(web)
    if (url.hostname.startsWith('payments.')) {
      url.hostname = `api.${url.hostname}`
      return url.origin
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      url.port = url.port || '8080'
      return url.origin
    }
  } catch {
    // fall through
  }

  return 'https://api.payments.indobase.in'
}

export function makePaymentsMcpToken(payload: PaymentsMcpTokenPayload, secret: string): string {
  return makePaymentsHandoffToken(payload, secret)
}

export async function mintPaymentsMcpBearer({
  claims,
  projectRef,
}: {
  claims: Claims
  projectRef: string
}): Promise<{
  apiBaseUrl: string
  bearerToken: string
  organizationSlug: string
  projectRef: string
  role: PaymentsRole
}> {
  const apiKeyFallback = process.env.INDOBASE_PAYMENTS_API_KEY?.trim()
  const project = await getProject({ claims, ref: projectRef })
  if (!project) {
    throw new Error('Project not found')
  }

  const userId = getGotrueUserId(claims)
  const role = await resolvePaymentsRole(userId, project.organization_slug)
  if (!role) {
    throw new Error(
      'Ask an organization owner or admin to grant you Payments access (owner, admin, developer, or viewer).'
    )
  }

  const apiBaseUrl = resolvePaymentsApiBaseUrl()

  if (apiKeyFallback) {
    return {
      apiBaseUrl,
      bearerToken: apiKeyFallback,
      organizationSlug: project.organization_slug,
      projectRef: project.ref,
      role,
    }
  }

  const now = Math.floor(Date.now() / 1000)
  const payload: PaymentsMcpTokenPayload = {
    aud: 'indobase-payments-mcp',
    email: getPrimaryEmail(claims),
    exp: now + PAYMENTS_MCP_TOKEN_TTL_SECONDS,
    iat: now,
    iss: getStudioOrigin(),
    organization_name: project.organization_slug,
    organization_slug: project.organization_slug,
    project_name: project.name,
    project_ref: project.ref,
    role,
    studio_url: getStudioOrigin(),
    sub: userId,
  }

  return {
    apiBaseUrl,
    bearerToken: makePaymentsMcpToken(payload, resolvePaymentsHandoffSecret()),
    organizationSlug: project.organization_slug,
    projectRef: project.ref,
    role,
  }
}

export type PaymentsApiClient = {
  apiBaseUrl: string
  request: <T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options?: { body?: unknown; query?: Record<string, string | number | boolean | undefined | null> }
  ) => Promise<T>
}

export function createPaymentsApiClient(opts: {
  apiBaseUrl: string
  bearerToken: string
}): PaymentsApiClient {
  const apiBaseUrl = opts.apiBaseUrl.replace(/\/+$/, '')

  return {
    apiBaseUrl,
    async request<T>(method, path, options = {}) {
      const url = new URL(path.startsWith('http') ? path : `${apiBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`)
      for (const [key, value] of Object.entries(options.query || {})) {
        if (value === undefined || value === null || value === '') continue
        url.searchParams.set(key, String(value))
      }

      const response = await fetch(url.toString(), {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${opts.bearerToken}`,
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      })

      const text = await response.text()
      let json: unknown = null
      if (text) {
        try {
          json = JSON.parse(text)
        } catch {
          json = { raw: text }
        }
      }

      if (!response.ok) {
        const message =
          json && typeof json === 'object' && json !== null && 'message' in json
            ? String((json as { message: unknown }).message)
            : `Payments API ${response.status}`
        throw new Error(message)
      }

      return json as T
    },
  }
}

/** Deterministic id helper kept for tests / debugging — not used at runtime. */
export function paymentsMcpRequestId(): string {
  return crypto.randomUUID()
}
