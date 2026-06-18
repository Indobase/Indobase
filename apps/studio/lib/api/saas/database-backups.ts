import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getGotrueUserId } from './platform'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, unknown>

type ProjectBackupRow = {
  id: number
  ref: string
  region: string
  status: string
  physical_backups_enabled: boolean
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
        coalesce(p.physical_backups_enabled, false) as physical_backups_enabled
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
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

  return {
    backups: [] as {
      id: number
      inserted_at: string
      isPhysicalBackup: boolean
      project_id: number
      status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'REMOVED' | 'ARCHIVED' | 'CANCELLED'
    }[],
    physicalBackupData: {},
    pitr_enabled: p.physical_backups_enabled,
    region: p.region,
    walg_enabled: p.physical_backups_enabled,
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

  const status =
    p.status === 'ACTIVE_HEALTHY'
      ? p.physical_backups_enabled
        ? ('physical-backups-enabled' as const)
        : ('ok' as const)
      : ('project-not-active' as const)

  return {
    backups: [],
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
