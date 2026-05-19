import crypto from 'node:crypto'

import { decryptString } from './util'
import { executeQuery } from './query'

export function resolveJwtSecretFromEnv(): string {
  return (process.env.AUTH_JWT_SECRET ?? process.env.JWT_SECRET ?? '').trim()
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
  const headerB64 = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payloadB64 = base64Url(
    JSON.stringify({
      role,
      iss: 'indobase',
      project_ref: projectRef,
      iat: now,
      exp: now + 60 * 60 * 24 * 365 * 10,
      ...(extraClaims ?? {}),
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
