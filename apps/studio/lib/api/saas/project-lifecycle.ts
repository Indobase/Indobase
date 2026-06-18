import type { JwtPayload } from 'indobaseinc/indobase-js'

import { recordAuditLog } from './audit'
import { getGotrueUserId } from './platform'
import { executeQuery } from './query'
import {
  isDataPlaneProvisionerConfigured,
  repairTenantDataPlaneStack,
  stopTenantDataPlaneStack,
} from './tenant-data-plane-provision'

type Claims = JwtPayload & Record<string, unknown>

type ProjectLifecycleRow = {
  id: number
  organization_id: number
  name: string
  status: string
  paused_at: string | null
  connection_string_enc: string | null
  connection_string: string | null
  data_plane_last_provisioned_at: string | null
}

async function loadProjectForLifecycle({
  ref,
  gotrueId,
  roles = ['owner', 'admin'],
}: {
  ref: string
  gotrueId: string
  roles?: string[]
}): Promise<ProjectLifecycleRow | null> {
  const row = await executeQuery<ProjectLifecycleRow>({
    query: `
      select
        p.id,
        p.organization_id,
        p.name,
        p.status,
        p.paused_at,
        p.connection_string_enc,
        p.connection_string,
        p.data_plane_last_provisioned_at
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1
        and m.gotrue_id = $2
        and m.role = any($3::text[])
      limit 1
    `,
    parameters: [ref, gotrueId, roles],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  return row.data?.[0] ?? null
}

async function setProjectStatus({
  ref,
  gotrueId,
  status,
  pausedAt,
  clearPausedAt = false,
}: {
  ref: string
  gotrueId: string
  status: string
  pausedAt?: string | null
  clearPausedAt?: boolean
}) {
  const r = await executeQuery({
    query: `
      update saas.projects p
      set status = $1,
          paused_at = case
            when $5::boolean then null
            when $4::text is not null then $4::timestamptz
            else p.paused_at
          end
      where p.ref = $2
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = p.organization_id
            and m.gotrue_id = $3
            and m.role in ('owner', 'admin')
        )
    `,
    parameters: [status, ref, gotrueId, pausedAt ?? null, clearPausedAt],
    actorId: gotrueId,
  })
  if (r.error) throw r.error
}

function hasDedicatedDataPlane(p: ProjectLifecycleRow): boolean {
  return Boolean((p.connection_string_enc ?? '').trim() || (p.connection_string ?? '').trim())
}

export async function pauseProjectForActor({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<void> {
  const gotrueId = getGotrueUserId(claims)
  const p = await loadProjectForLifecycle({ ref, gotrueId })
  if (!p) throw new Error('Project not found or insufficient permissions')
  if (p.status === 'INACTIVE') return
  if (p.status === 'PAUSING') return

  await setProjectStatus({ ref, gotrueId, status: 'PAUSING' })

  if (hasDedicatedDataPlane(p) && isDataPlaneProvisionerConfigured() && p.data_plane_last_provisioned_at) {
    await stopTenantDataPlaneStack({ ref })
  }

  await setProjectStatus({
    ref,
    gotrueId,
    status: 'INACTIVE',
    pausedAt: new Date().toISOString(),
  })

  await recordAuditLog({
    claims,
    organizationId: p.organization_id,
    projectRef: ref,
    action: 'project.pause',
    targetType: 'project',
    targetDescription: `Paused project "${p.name}" (${ref})`,
  })
}

export async function restoreProjectForActor({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<void> {
  const gotrueId = getGotrueUserId(claims)
  const p = await loadProjectForLifecycle({ ref, gotrueId })
  if (!p) throw new Error('Project not found or insufficient permissions')
  if (p.status === 'ACTIVE_HEALTHY') return

  await setProjectStatus({ ref, gotrueId, status: 'COMING_UP' })

  if (hasDedicatedDataPlane(p) && isDataPlaneProvisionerConfigured()) {
    await repairTenantDataPlaneStack({ ref, reason: 'project_restore' })
  }

  await setProjectStatus({ ref, gotrueId, status: 'ACTIVE_HEALTHY', clearPausedAt: true })

  await recordAuditLog({
    claims,
    organizationId: p.organization_id,
    projectRef: ref,
    action: 'project.restore',
    targetType: 'project',
    targetDescription: `Restored project "${p.name}" (${ref})`,
  })
}

export async function restartProjectForActor({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<void> {
  const gotrueId = getGotrueUserId(claims)
  const p = await loadProjectForLifecycle({
    ref,
    gotrueId,
    roles: ['owner', 'admin', 'developer'],
  })
  if (!p) throw new Error('Project not found or insufficient permissions')
  if (p.status === 'INACTIVE') {
    throw new Error('Cannot restart a paused project. Restore it first.')
  }

  await setProjectStatus({ ref, gotrueId, status: 'RESTARTING' })

  if (hasDedicatedDataPlane(p) && isDataPlaneProvisionerConfigured() && p.data_plane_last_provisioned_at) {
    await repairTenantDataPlaneStack({ ref, reason: 'project_restart' })
  }

  await setProjectStatus({ ref, gotrueId, status: 'ACTIVE_HEALTHY' })

  await recordAuditLog({
    claims,
    organizationId: p.organization_id,
    projectRef: ref,
    action: 'project.restart',
    targetType: 'project',
    targetDescription: `Restarted project "${p.name}" (${ref})`,
  })
}

export async function getProjectLifecycleStatus({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<{ status: string }> {
  const gotrueId = getGotrueUserId(claims)
  const p = await loadProjectForLifecycle({
    ref,
    gotrueId,
    roles: ['owner', 'admin', 'developer'],
  })
  if (!p) throw new Error('Project not found')
  return { status: p.status }
}

export async function getProjectPauseStatus({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  const gotrueId = getGotrueUserId(claims)
  const p = await loadProjectForLifecycle({ ref, gotrueId })
  if (!p) throw new Error('Project not found')

  const maxDays = 90
  let remainingDays: number | null = null
  if (p.paused_at && p.status === 'INACTIVE') {
    const pausedMs = Date.parse(p.paused_at)
    if (Number.isFinite(pausedMs)) {
      const elapsedDays = Math.floor((Date.now() - pausedMs) / (24 * 60 * 60 * 1000))
      remainingDays = Math.max(0, maxDays - elapsedDays)
    }
  }

  return {
    can_restore: p.status === 'INACTIVE',
    last_paused_on: p.paused_at ? new Date(p.paused_at).toISOString() : null,
    latest_downloadable_backup_id: null,
    max_days_till_restore_disabled: maxDays,
    remaining_days_till_restore_disabled: remainingDays,
  }
}
