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

export async function collectProjectStorageBytes(projectRef: string): Promise<number | null> {
  const schemaCheck = await queryProjectDatabase<{ ok: boolean }>(
    projectRef,
    `select exists (
      select 1 from information_schema.tables
      where table_schema = 'storage' and table_name = 'objects'
    ) as ok`
  )
  if (!schemaCheck?.[0]?.ok) return 0

  const rows = await queryProjectDatabase<{ size: string }>(
    projectRef,
    `select coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0)::text as size
     from storage.objects o
     left join storage.buckets b on b.id = o.bucket_id
     where b.name = $1
        or b.name = $2
        or b.id is null`,
    [projectRef, `tenant-${projectRef}`]
  )
  if (!rows?.[0]) return 0
  return parseInt(rows[0].size ?? '0', 10) || 0
}
