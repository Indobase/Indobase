import { Client } from 'pg'

import { resolveProjectDatabaseUrl } from '../project-database-url'

export async function collectProjectStorageBytes(projectRef: string): Promise<number | null> {
  const normalized = await resolveProjectDatabaseUrl(projectRef)
  if (!normalized) return null

  const client = new Client({ connectionString: normalized })
  await client.connect()
  try {
    const schemaCheck = await client.query<{ ok: boolean }>(
      `select exists (
        select 1 from information_schema.tables
        where table_schema = 'storage' and table_name = 'objects'
      ) as ok`
    )
    if (!schemaCheck.rows[0]?.ok) return 0

    const res = await client.query<{ size: string }>(
      `select coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0)::text as size
       from storage.objects o
       left join storage.buckets b on b.id = o.bucket_id
       where b.name = $1
          or b.name = $2
          or b.id is null`,
      [projectRef, `tenant-${projectRef}`]
    )
    return parseInt(res.rows[0]?.size ?? '0', 10) || 0
  } finally {
    await client.end()
  }
}
