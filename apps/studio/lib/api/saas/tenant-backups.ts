import { getPlanEntitlements } from './plan-entitlements'
import { executeQuery } from './query'
import { decryptString } from './util'

/**
 * Per-tenant logical backups. The actual `pg_dump | aws s3 cp` runs on the provisioner (VPS-side,
 * next to Postgres + MinIO); this module orchestrates it and records results in
 * saas.project_backups, which is what the dashboard reads.
 *
 * PITR is impossible here (WAL is cluster-wide across all tenantdb_*), so the offering is a daily
 * logical dump per tenant with plan-based retention.
 */

function provisionerConfig() {
  const provisionerUrl = (process.env.DATA_PLANE_PROVISIONER_URL || '').trim().replace(/\/$/, '')
  const provisionerToken = (process.env.DATA_PLANE_PROVISIONER_TOKEN || '').trim()
  if (!provisionerUrl || !provisionerToken) {
    throw new Error(
      'Data-plane provisioner is not configured. Set DATA_PLANE_PROVISIONER_URL and DATA_PLANE_PROVISIONER_TOKEN.'
    )
  }
  return { provisionerUrl, provisionerToken }
}

export type BackupRow = {
  id: string
  project_ref: string
  object_key: string | null
  size_bytes: number | null
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired' | 'deleted'
  error: string | null
  retention_until: string | null
  started_at: string
  completed_at: string | null
}

type BackupEligibleProject = {
  ref: string
  plan: string
  db_name: string | null
}

/** Extract the tenant database name from its (encrypted) connection string. */
function tenantDbNameFromConnection(connEnc: string | null, connPlain: string | null): string | null {
  const raw = (connEnc?.trim() ? decryptString(connEnc) : connPlain?.trim()) || ''
  if (!raw) return null
  try {
    const u = new URL(raw.replace(/^postgres:\/\//, 'postgresql://'))
    const db = u.pathname.replace(/^\//, '').trim()
    return db || null
  } catch {
    return null
  }
}

/**
 * Projects whose plan grants backups (backupRetentionDays > 0) and that have a dedicated tenant DB.
 * Model A / shared-gateway-without-dedicated-DB projects are skipped: there is no isolated database
 * to dump.
 */
export async function listBackupEligibleProjects(limit = 200): Promise<
  Array<{ ref: string; retentionDays: number; dbName: string }>
> {
  const rows = await executeQuery<BackupEligibleProject & { connection_string_enc: string | null }>({
    query: `
      select
        p.ref,
        o.plan,
        p.connection_string as db_name,
        p.connection_string_enc
      from saas.projects p
      join saas.organizations o on o.id = p.organization_id
      where not coalesce(p.is_branch, false)
        and coalesce(p.status, '') not in ('REMOVED', 'DELETED')
        and (coalesce(trim(p.connection_string_enc), '') <> '' or coalesce(trim(p.connection_string), '') <> '')
      order by p.id asc
      limit $1
    `,
    parameters: [limit],
  })
  if (rows.error) throw rows.error

  const eligible: Array<{ ref: string; retentionDays: number; dbName: string }> = []

  for (const row of rows.data ?? []) {
    const retentionDays = getPlanEntitlements(row.plan).backupRetentionDays
    if (retentionDays <= 0) continue

    // db_name here still holds the raw connection_string; resolve the actual DB name from it.
    const dbName = tenantDbNameFromConnection(row.connection_string_enc, row.db_name)
    if (!dbName) continue

    eligible.push({ ref: row.ref, retentionDays, dbName })
  }

  return eligible
}

async function callProvisioner(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const { provisionerUrl, provisionerToken } = provisionerConfig()
  const resp = await fetch(`${provisionerUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await resp.text()
  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text.slice(0, 300) }
  }
  return { ok: resp.ok, status: resp.status, data }
}

/**
 * Run one backup for a project: record a pending row, ask the provisioner to dump+upload, then
 * finalise the row. Returns the backup id. Never throws for an individual dump failure — it records
 * the failure so the fleet run can continue.
 */
export async function runTenantBackup({
  ref,
  dbName,
  retentionDays,
}: {
  ref: string
  dbName: string
  retentionDays: number
}): Promise<{ id: string; ok: boolean }> {
  const inserted = await executeQuery<{ id: string }>({
    query: `
      insert into saas.project_backups (project_ref, status, kind, retention_until)
      values ($1, 'in_progress', 'logical', now() + make_interval(days => $2))
      returning id::text
    `,
    parameters: [ref, retentionDays],
  })
  if (inserted.error) throw inserted.error
  const id = inserted.data?.[0]?.id
  if (!id) throw new Error('Failed to create backup record')

  const objectKey = `backups/${ref}/${id}.dump`

  try {
    const result = await callProvisioner('/backup-tenant', {
      project_ref: ref,
      db_name: dbName,
      object_key: objectKey,
    })

    if (!result.ok || !result.data?.ok) {
      const message = result.data?.message || result.data?.error || `provisioner status ${result.status}`
      await executeQuery({
        query: `update saas.project_backups set status = 'failed', error = $2, completed_at = now() where id = $1`,
        parameters: [id, String(message).slice(0, 500)],
      })
      return { id, ok: false }
    }

    await executeQuery({
      query: `
        update saas.project_backups
        set status = 'completed', object_key = $2, size_bytes = $3, completed_at = now()
        where id = $1
      `,
      parameters: [id, objectKey, Number(result.data.size_bytes) || null],
    })
    return { id, ok: true }
  } catch (error) {
    await executeQuery({
      query: `update saas.project_backups set status = 'failed', error = $2, completed_at = now() where id = $1`,
      parameters: [id, error instanceof Error ? error.message.slice(0, 500) : 'Unknown error'],
    })
    return { id, ok: false }
  }
}

/** Delete objects for backups past their retention window and mark the rows expired. */
export async function pruneExpiredBackups(limit = 500): Promise<{ pruned: number; failed: number }> {
  const rows = await executeQuery<{ id: string; object_key: string | null }>({
    query: `
      select id::text, object_key
      from saas.project_backups
      where status = 'completed'
        and retention_until is not null
        and retention_until < now()
      order by retention_until asc
      limit $1
    `,
    parameters: [limit],
  })
  if (rows.error) throw rows.error

  let pruned = 0
  let failed = 0

  for (const row of rows.data ?? []) {
    try {
      if (row.object_key) {
        const result = await callProvisioner('/delete-backup', { object_key: row.object_key })
        if (!result.ok) {
          failed += 1
          continue
        }
      }
      await executeQuery({
        query: `update saas.project_backups set status = 'expired' where id = $1`,
        parameters: [row.id],
      })
      pruned += 1
    } catch {
      failed += 1
    }
  }

  return { pruned, failed }
}

/** List a project's backups for the dashboard, newest first. */
export async function listProjectBackups(ref: string, limit = 30): Promise<BackupRow[]> {
  const rows = await executeQuery<BackupRow>({
    query: `
      select
        id::text,
        project_ref,
        object_key,
        size_bytes,
        status,
        error,
        retention_until,
        started_at,
        completed_at
      from saas.project_backups
      where project_ref = $1
        and status in ('completed', 'in_progress', 'failed')
      order by started_at desc
      limit $2
    `,
    parameters: [ref, limit],
  })
  if (rows.error) throw rows.error
  return rows.data ?? []
}
