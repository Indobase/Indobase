import { executeQuery } from '../query'
import { encryptedConnectionForPgMeta } from '../util'
import { resolveProjectDatabaseUrl } from '../project-database-url'

async function queryProjectDatabase<T>(
  projectRef: string,
  sql: string,
  parameters: unknown[] = []
): Promise<T[] | null> {
  const dbUrl = await resolveProjectDatabaseUrl(projectRef)
  if (!dbUrl) return null

  const result = await executeQuery<T>({
    query: sql,
    parameters,
    headers: {
      'x-connection-encrypted': encryptedConnectionForPgMeta(dbUrl),
    },
  })
  if (result.error) throw result.error
  return result.data ?? null
}

/**
 * Monthly active users for a tenant project: distinct GoTrue users who signed in since
 * `periodStart`. Returns null when the tenant DB is unreachable, 0 when auth isn't present.
 */
export async function collectProjectMonthlyActiveUsers({
  projectRef,
  periodStart,
}: {
  projectRef: string
  periodStart: Date
}): Promise<number | null> {
  const schemaCheck = await queryProjectDatabase<{ ok: boolean }>(
    projectRef,
    `select exists (
      select 1 from information_schema.tables
      where table_schema = 'auth' and table_name = 'users'
    ) as ok`
  )
  if (schemaCheck == null) return null
  if (!schemaCheck?.[0]?.ok) return 0

  const rows = await queryProjectDatabase<{ mau: string }>(
    projectRef,
    `select count(*)::text as mau
     from auth.users
     where last_sign_in_at is not null
       and last_sign_in_at >= $1::timestamptz`,
    [periodStart.toISOString()]
  )
  if (!rows?.[0]) return 0
  return parseInt(rows[0].mau ?? '0', 10) || 0
}
