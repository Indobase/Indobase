/**
 * Blocks ad-hoc SQL that enumerates cluster-wide Postgres catalogs in SaaS mode.
 * pg_database is shared across the cluster — even without CONNECT, names leak cross-tenant.
 */

const PG_DATABASE_REFERENCE =
  /\bfrom\s+pg_catalog\.pg_database\b|\bfrom\s+pg_database\b|\bjoin\s+pg_database\b|\bpg_database\.datname\b/i

const CURRENT_DB_SIZE_ONLY =
  /^\s*select\s+(?:sum\s*\(\s*)?pg_database_size\s*\(\s*current_database\s*\(\s*\)\s*\)(?:\s*\))?::/i

function stripSqlComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

export function getBlockedSaasCatalogQueryReason(query: string): string | null {
  const normalized = stripSqlComments(String(query || '')).trim()
  if (!normalized) return null

  if (!PG_DATABASE_REFERENCE.test(normalized)) return null

  if (CURRENT_DB_SIZE_ONLY.test(normalized)) return null

  return 'Queries against pg_database are not allowed in SaaS mode (cross-tenant database enumeration).'
}
