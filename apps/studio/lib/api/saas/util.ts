import crypto from 'crypto-js'
import { IS_SAAS } from 'lib/constants'
import {
  ENCRYPTION_KEY,
  POSTGRES_DATABASE,
  POSTGRES_HOST,
  POSTGRES_PASSWORD,
  POSTGRES_PORT,
  POSTGRES_USER_READ_WRITE,
  POSTGRES_USER_READ_ONLY,
} from './constants'

/** No-op: hosted Supabase Platform mode is removed; Studio always uses the Indobase SaaS control plane. */
export function assertSaaSBackend() {}

export function encryptString(stringToEncrypt: string): string {
  return crypto.AES.encrypt(stringToEncrypt, ENCRYPTION_KEY).toString()
}

export function decryptString(encrypted: string): string {
  return crypto.AES.decrypt(encrypted, ENCRYPTION_KEY).toString(crypto.enc.Utf8)
}

/** Percent-encode user/password for PostgreSQL URIs (@ : / etc. must not break the URI). */
function encodePgUriUserInfo(value: string) {
  return encodeURIComponent(value)
}

export function getConnectionString({ readOnly }: { readOnly: boolean }) {
  const postgresUser = readOnly ? POSTGRES_USER_READ_ONLY : POSTGRES_USER_READ_WRITE

  const user = encodePgUriUserInfo(postgresUser)
  const pass = encodePgUriUserInfo(POSTGRES_PASSWORD)

  return `postgresql://${user}:${pass}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}`
}

/**
 * Returns the AES value for pg-meta `x-connection-encrypted` when browsing a project.
 * For one-database-per-tenant, pass the plaintext URI from `saas.projects.connection_string`.
 * When absent in SaaS, callers typically fall back to shared POSTGRES_* (legacy Model A projects).
 */
export function encryptedConnectionForPgMeta(tenantDatabaseUrl: string | null | undefined): string {
  const trimmed = tenantDatabaseUrl?.trim()
  if (trimmed) {
    return encryptString(trimmed)
  }
  if (IS_SAAS) {
    throw new Error('Missing tenant database connection_string for SaaS project')
  }
  return encryptString(getConnectionString({ readOnly: true }))
}
