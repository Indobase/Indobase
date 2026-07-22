import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getGotrueUserId } from './platform'
import { getPlanEntitlements } from './plan-entitlements'
import { executeQuery } from './query'
import { listProjectBackups } from './tenant-backups'

type Claims = JwtPayload & Record<string, unknown>

type ProjectBackupRow = {
  id: number
  ref: string
  region: string
  status: string
  physical_backups_enabled: boolean
  plan: string
}

async function loadProjectForBackups({
  ref,
  gotrueId,
}: {
  ref: string
  gotrueId: string
}): Promise<ProjectBackupRow | null> {
  const row = await executeQuery<ProjectBackupRow>({
    query: `
      select
        p.id,
        p.ref,
        p.region,
        p.status,
        coalesce(p.physical_backups_enabled, false) as physical_backups_enabled,
        o.plan
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      join saas.organizations o on o.id = p.organization_id
      where p.ref = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer')
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  return row.data?.[0] ?? null
}

export async function getProjectBackupsResponse({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const gotrueId = getGotrueUserId(claims)
  const p = await loadProjectForBackups({ ref, gotrueId })
  if (!p) throw new Error('Project not found')

  const retentionDays = getPlanEntitlements(p.plan).backupRetentionDays
  const rows = retentionDays > 0 ? await listProjectBackups(ref) : []

  const statusMap: Record<string, 'COMPLETED' | 'FAILED' | 'PENDING'> = {
    completed: 'COMPLETED',
    failed: 'FAILED',
    in_progress: 'PENDING',
  }

  return {
    backups: rows.map((b) => ({
      id: Number(b.id),
      inserted_at: b.started_at,
      // Logical (pg_dump) backups, never physical/WAL — PITR is not possible on the shared cluster.
      isPhysicalBackup: false,
      project_id: p.id,
      status: statusMap[b.status] ?? 'PENDING',
      size_bytes: b.size_bytes ?? undefined,
    })),
    physicalBackupData: {},
    // No PITR/WAL-G on this architecture; retention is delivered via scheduled logical dumps.
    pitr_enabled: false,
    walg_enabled: false,
    retention_days: retentionDays,
    region: p.region,
  }
}

export async function getDownloadableBackupsResponse({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const gotrueId = getGotrueUserId(claims)
  const p = await loadProjectForBackups({ ref, gotrueId })
  if (!p) throw new Error('Project not found')

  const retentionDays = getPlanEntitlements(p.plan).backupRetentionDays

  const status =
    p.status !== 'ACTIVE_HEALTHY'
      ? ('project-not-active' as const)
      : retentionDays > 0
        ? ('ok' as const)
        : ('backups-not-available' as const)

  const rows = retentionDays > 0 ? await listProjectBackups(ref) : []

  return {
    backups: rows
      .filter((b) => b.status === 'completed' && b.object_key)
      .map((b) => ({
        id: Number(b.id),
        inserted_at: b.started_at,
        size_bytes: b.size_bytes ?? undefined,
      })),
    status,
  }
}

export async function enablePhysicalBackupsForProject({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const gotrueId = getGotrueUserId(claims)
  const row = await executeQuery({
    query: `
      update saas.projects p
      set physical_backups_enabled = true
      from saas.organization_members m
      where p.ref = $1
        and m.organization_id = p.organization_id
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin')
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
}

export function backupsNotConfiguredResponse() {
  return {
    message:
      'Physical backups and PITR are not configured on this Indobase deployment yet. Contact your operator to enable WAL archiving.',
  }
}
