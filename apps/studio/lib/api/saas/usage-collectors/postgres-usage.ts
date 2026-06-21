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

export async function collectProjectDatabaseBytes(projectRef: string): Promise<number | null> {
  const rows = await queryProjectDatabase<{ size: string }>(
    projectRef,
    `select pg_database_size(current_database())::text as size`
  )
  if (!rows?.[0]) return null
  return parseInt(rows[0].size ?? '0', 10) || 0
}
