/**
 * Canonical Indobase Postgres connection string shapes for docs and examples.
 *
 * Hosted tenants use per-project subdomains: `https://<project-ref>.indobase.in`
 * Pooler user: `postgres.<project-ref>` (Supavisor-style when enabled on the tenant stack).
 */
export const INDOBASE_PUBLIC_DOMAIN = 'indobase.in'

/** Direct Postgres on the tenant host (session / migrations). */
export const DIRECT_CONNECTION_TEMPLATE = `postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].${INDOBASE_PUBLIC_DOMAIN}:5432/postgres`

/** Session pooler (IPv4-friendly proxy on port 5432). */
export const SESSION_POOLER_TEMPLATE = `postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@[PROJECT-REF].${INDOBASE_PUBLIC_DOMAIN}:5432/postgres`

/** Transaction pooler (serverless / edge; port 6543). */
export const TRANSACTION_POOLER_TEMPLATE = `postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@[PROJECT-REF].${INDOBASE_PUBLIC_DOMAIN}:6543/postgres`

/** Short host pattern referenced in prose (Colab, IPv4 notes, etc.). */
export const TENANT_HOST_PATTERN = `<project-ref>.${INDOBASE_PUBLIC_DOMAIN}`
