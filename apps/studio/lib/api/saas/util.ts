import crypto from 'crypto-js'
import { randomUUID } from 'crypto'
import { IS_SAAS } from 'lib/constants'
import {
  ENCRYPTION_KEY,
  ENCRYPTION_KEYS,
  POSTGRES_DATABASE,
  POSTGRES_HOST,
  POSTGRES_PASSWORD,
  POSTGRES_PORT,
  POSTGRES_USER_READ_WRITE,
  POSTGRES_USER_READ_ONLY,
} from './constants'
import { isSharedControlPlaneDatabaseFallbackAllowed } from './data-plane-mode'
import { SecretDecryptionError } from './secret-decryption-error'

/** No-op: hosted Supabase Platform mode is removed; Studio always uses the Indobase SaaS control plane. */
export function assertSaaSBackend() {}

export function encryptString(stringToEncrypt: string): string {
  return crypto.AES.encrypt(stringToEncrypt, ENCRYPTION_KEY).toString()
}

export function decryptString(encrypted: string): string {
  const keys = ENCRYPTION_KEYS.length > 0 ? ENCRYPTION_KEYS : [ENCRYPTION_KEY]
  for (const key of keys) {
    try {
      const plain = crypto.AES.decrypt(encrypted, key).toString(crypto.enc.Utf8)
      if (plain.length > 0) return plain
    } catch {
      // Wrong key — CryptoJS throws "Malformed UTF-8 data" for some ciphertext.
    }
  }
  const correlationId = randomUUID()
  console.error('[saas] decryptString failed', {
    correlationId,
    keysConfigured: keys.length,
  })
  throw new SecretDecryptionError(correlationId)
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
 * Fail closed in SaaS: never fall back to the shared control-plane DB unless Model A is
 * explicitly allowed (`SAAS_ALLOW_SHARED_DATABASE_TENANCY=true`).
 */
export function encryptedConnectionForPgMeta(tenantDatabaseUrl: string | null | undefined): string {
  const trimmed = tenantDatabaseUrl?.trim()
  if (trimmed) {
    return encryptString(trimmed)
  }
  if (IS_SAAS) {
    if (!isSharedControlPlaneDatabaseFallbackAllowed()) {
      return ''
    }
    return encryptString(getConnectionString({ readOnly: false }))
  }
  return encryptString(getConnectionString({ readOnly: true }))
}
