// Constants specific to SaaS environments

// Indobase compose uses `CRYPTO_KEY` for project API keys; pg-meta / tenant URIs may use
// `PG_META_CRYPTO_KEY`. When both are set they can differ — decrypt must try each key.
function uniqueNonEmptyKeys(...candidates: Array<string | undefined>) {
  const keys: string[] = []
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed && !keys.includes(trimmed)) keys.push(trimmed)
  }
  return keys
}

export const ENCRYPTION_KEYS = uniqueNonEmptyKeys(
  process.env.PG_META_CRYPTO_KEY,
  process.env.CRYPTO_KEY
)

/** Primary key for new encrypts (pg-meta / connection strings prefer PG_META when set). */
export const ENCRYPTION_KEY = ENCRYPTION_KEYS[0] ?? 'SAMPLE_KEY'
export const POSTGRES_PORT = parseInt(process.env.POSTGRES_PORT || '5432', 10)
export const POSTGRES_HOST = process.env.POSTGRES_HOST || 'indobase-db'
export const POSTGRES_DATABASE = process.env.POSTGRES_DB || 'postgres'
/** Primary DB login used by the Postgres image (`POSTGRES_USER`); pairs with `POSTGRES_PASSWORD`. */
export const POSTGRES_USER = process.env.POSTGRES_USER?.trim() || 'postgres'
export const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'postgres'
/** Control-plane queries via postgres-meta; must use the same password as `POSTGRES_PASSWORD`. */
export const POSTGRES_USER_READ_WRITE =
  process.env.POSTGRES_USER_READ_WRITE?.trim() || POSTGRES_USER
export const POSTGRES_USER_READ_ONLY =
  process.env.POSTGRES_USER_READ_ONLY || 'supabase_read_only_user'

/** Session advisory lock id for `saas.grant_studio_access()` (must match migration SQL). */
export const SAAS_PG_ADVISORY_LOCK_GRANT_STUDIO_ACCESS = 9625844491
/** Serialize control-plane RLS bootstrap so parallel `ensureSaasTables` calls cannot apply DDL twice. */
export const SAAS_PG_ADVISORY_LOCK_CONTROL_PLANE_RLS = 9625844493
