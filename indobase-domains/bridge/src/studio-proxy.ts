import { createHmac } from 'node:crypto'

import type { Session } from './auth.js'

export const DOMAINS_PRODUCT_API_AUD = 'indobase-domains-api' as const
const TOKEN_TTL_SECONDS = 60 * 15

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function mintDomainsProductToken(session: Session, secret: string): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: DOMAINS_PRODUCT_API_AUD,
    sub: session.gotrueId,
    email: session.email,
    project_ref: session.projectRef,
    role: session.role,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  }
  const headerB64 = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = b64urlEncode(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const signature = createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64urlEncode(signature)}`
}

export function resolveStudioBaseUrl(): string {
  const raw =
    process.env.STUDIO_INTERNAL_URL?.trim() ||
    process.env.STUDIO_PUBLIC_URL?.trim() ||
    'https://studio.indobase.in'
  return raw.replace(/\/+$/, '')
}

export async function proxyStudioDomainsApi(
  session: Session,
  secret: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = mintDomainsProductToken(session, secret)
  const base = resolveStudioBaseUrl()
  const url = `${base}/api/platform/projects/${encodeURIComponent(session.projectRef)}/domains${path}`

  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
}
