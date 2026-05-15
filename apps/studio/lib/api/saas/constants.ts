// Constants specific to SaaS environments

// Indobase compose uses `CRYPTO_KEY` for pg-meta, while Studio sometimes uses `PG_META_CRYPTO_KEY`.
// Support both so encryption/decryption matches.
export const ENCRYPTION_KEY = process.env.PG_META_CRYPTO_KEY || process.env.CRYPTO_KEY || 'SAMPLE_KEY'
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
