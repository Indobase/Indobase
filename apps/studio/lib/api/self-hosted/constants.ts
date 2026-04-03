// Constants specific to self-hosted environments

// Indobase compose uses `CRYPTO_KEY` for pg-meta, while Studio sometimes uses `PG_META_CRYPTO_KEY`.
// Support both so encryption/decryption matches.
export const ENCRYPTION_KEY = process.env.PG_META_CRYPTO_KEY || process.env.CRYPTO_KEY || 'SAMPLE_KEY'
export const POSTGRES_PORT = parseInt(process.env.POSTGRES_PORT || '5432', 10)
export const POSTGRES_HOST = process.env.POSTGRES_HOST || 'db'
export const POSTGRES_DATABASE = process.env.POSTGRES_DB || 'postgres'
export const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'postgres'
export const POSTGRES_USER_READ_WRITE = process.env.POSTGRES_USER_READ_WRITE || 'supabase_admin'
export const POSTGRES_USER_READ_ONLY =
  process.env.POSTGRES_USER_READ_ONLY || 'supabase_read_only_user'
