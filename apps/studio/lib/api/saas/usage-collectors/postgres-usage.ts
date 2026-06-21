import { Client } from 'pg'

import { resolveProjectDatabaseUrl } from '../project-database-url'

export async function collectProjectDatabaseBytes(projectRef: string): Promise<number | null> {
  const normalized = await resolveProjectDatabaseUrl(projectRef)
  if (!normalized) return null

  const client = new Client({ connectionString: normalized })
  await client.connect()
  try {
    const res = await client.query<{ size: string }>(
      `select pg_database_size(current_database())::text as size`
    )
    return parseInt(res.rows[0]?.size ?? '0', 10) || 0
  } finally {
    await client.end()
  }
}
