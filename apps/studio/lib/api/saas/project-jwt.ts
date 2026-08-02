import crypto from 'node:crypto'

import { decryptString } from './util'
import { executeQuery } from './query'

export function resolveJwtSecretFromEnv(): string {
  return (process.env.AUTH_JWT_SECRET ?? process.env.JWT_SECRET ?? '').trim()
}

/**
 * A fresh, project-scoped HS256 signing secret.
 *
 * Every project MUST have its own: a tenant's GoTrue/PostgREST only verify the JWT *signature*
 * (the `project_ref` claim is not enforced), so any two projects sharing a secret can read each
 * other's auth users and tables — their anon/service keys are mutually valid.
 */
export function generateProjectJwtSecret(): string {
  return crypto.randomBytes(48).toString('base64url')
}

function base64Url(input: Buffer | string) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function makeProjectJwt(
  jwtSecret: string,
  role: 'anon' | 'service_role',
  projectRef: string,
  extraClaims?: Record<string, unknown>
): string {
  return makeProjectAccessJwt(jwtSecret, {
    role,
    project_ref: projectRef,
    expSeconds: 60 * 60 * 24 * 365 * 10,
    ...(extraClaims ?? {}),
  })
}

/**
 * Short-lived (or long-lived) HS256 JWT for a tenant's PostgREST / Realtime.
 *
 * `makeProjectJwt` is the permanent anon/service_role form. Discuss and other
 * "bring your own auth" surfaces need an `authenticated` token whose `sub` is the
 * Studio user's gotrue id so RLS (`request.jwt.claim.sub`) resolves the member.
 */
export function makeProjectAccessJwt(
  jwtSecret: string,
  claims: {
    role: string
    project_ref: string
    expSeconds: number
    sub?: string
    aud?: string
    email?: string
    [key: string]: unknown
  }
): string {
  const headerB64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const { expSeconds, ...rest } = claims
  const payloadB64 = base64Url(
    JSON.stringify({
      iss: 'indobase',
      iat: now,
      exp: now + Math.max(1, Math.floor(expSeconds)),
      ...rest,
    })
  )

  const data = `${headerB64}.${payloadB64}`
  const sig = crypto.createHmac('sha256', jwtSecret).update(data).digest()
  return `${data}.${base64Url(sig)}`
}

const JWT_HEADER_B64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))

/**
 * Repairs legacy/malformed keys (2-part payload.sig without header) and regenerates garbage tokens.
 */
export function normalizeProjectApiKey(
  token: string,
  jwtSecret: string,
  role: 'anon' | 'service_role',
  projectRef: string
): string {
  const trimmed = token.trim()
  const parts = trimmed.split('.')
  if (parts.length === 3) return trimmed
  if (parts.length === 2) {
    return `${JWT_HEADER_B64}.${parts[0]}.${parts[1]}`
  }
  return makeProjectJwt(jwtSecret, role, projectRef)
}

export function isValidProjectApiKey(token: string): boolean {
  return token.trim().split('.').length === 3
}

export function resolveProjectJwtSecret(jwtSecretEnc: string | null | undefined): string {
  const enc = jwtSecretEnc?.trim()
  if (enc) {
    const secret = decryptString(enc)
    if (secret.length >= 32) return secret
    throw new Error('Stored project JWT secret is invalid (must be >= 32 chars)')
  }

  const env = resolveJwtSecretFromEnv()
  if (env.length >= 32) return env
  throw new Error('Missing/invalid JWT secret (must be >= 32 chars)')
}

export async function loadProjectJwtSecretEncForMember({
  projectRef,
  gotrueId,
}: {
  projectRef: string
  gotrueId: string
}): Promise<{ jwtSecretEnc: string | null } | null> {
  const row = await executeQuery<{ jwt_secret_enc: string | null }>({
    query: `
      select p.jwt_secret_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [projectRef, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) return null
  return { jwtSecretEnc: row.data[0].jwt_secret_enc }
}
