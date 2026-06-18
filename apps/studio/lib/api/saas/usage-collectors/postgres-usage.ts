import { Client } from 'pg'

import { decryptString } from '../util'
import { executeQuery } from '../query'

export async function collectProjectDatabaseBytes(projectRef: string): Promise<number | null> {
  const row = await executeQuery<{ connection_string_enc: string | null; connection_string: string | null }>({
    query: `
      select connection_string_enc, connection_string
      from saas.projects
      where ref = $1
      limit 1
    `,
    parameters: [projectRef],
  })
  if (row.error) throw row.error
  const p = row.data?.[0]
  if (!p) return null

  const enc = (p.connection_string_enc ?? '').trim()
  const url = enc ? decryptString(enc) : p.connection_string
  if (!url?.trim()) return null

  const normalized = url.trim().replace(/^postgres:\/\//, 'postgresql://')
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
