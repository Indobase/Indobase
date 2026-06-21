import {
  POSTGRES_DATABASE,
  POSTGRES_HOST,
  POSTGRES_PASSWORD,
  POSTGRES_PORT,
  POSTGRES_USER,
} from './constants'
import { executeQuery } from './query'
import { decryptString } from './util'

function sharedControlPlaneDatabaseUrl(): string | null {
  if (!POSTGRES_PASSWORD?.trim() || !POSTGRES_HOST?.trim() || !POSTGRES_DATABASE?.trim()) {
    return null
  }
  const user = encodeURIComponent(POSTGRES_USER)
  const pass = encodeURIComponent(POSTGRES_PASSWORD)
  return `postgresql://${user}:${pass}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}`
}

export async function resolveProjectDatabaseUrl(projectRef: string): Promise<string | null> {
  const row = await executeQuery<{
    connection_string_enc: string | null
    connection_string: string | null
    data_plane_mode: string | null
  }>({
    query: `
      select connection_string_enc, connection_string, data_plane_mode
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
  const dedicated = enc ? decryptString(enc) : p.connection_string
  if (dedicated?.trim()) {
    return dedicated.trim().replace(/^postgres:\/\//, 'postgresql://')
  }

  const mode = (p.data_plane_mode ?? 'model_a').trim()
  if (mode === 'model_a' || mode === 'shared_gateway') {
    return sharedControlPlaneDatabaseUrl()
  }

  return null
}

/** Logflare tags shared compose stack logs as project `default`. */
export async function resolveLogflareProjectRef(projectRef: string): Promise<string> {
  const row = await executeQuery<{
    connection_string_enc: string | null
    connection_string: string | null
    data_plane_mode: string | null
  }>({
    query: `
      select connection_string_enc, connection_string, data_plane_mode
      from saas.projects
      where ref = $1
      limit 1
    `,
    parameters: [projectRef],
  })
  if (row.error) throw row.error
  const p = row.data?.[0]
  if (!p) return projectRef

  const hasDedicated = Boolean(
    (p.connection_string_enc ?? '').trim() || (p.connection_string ?? '').trim()
  )
  const mode = (p.data_plane_mode ?? 'model_a').trim()
  if (!hasDedicated && (mode === 'model_a' || mode === 'shared_gateway')) {
    return 'default'
  }
  return projectRef
}
