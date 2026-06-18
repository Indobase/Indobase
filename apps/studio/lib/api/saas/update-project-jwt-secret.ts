import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { components } from 'api-types'
import {
  JwtSecretUpdateError,
  JwtSecretUpdateProgress,
  JwtSecretUpdateStatus,
} from '@indobaseinc/shared-types/out/events'

import { ensureSaasTables, getGotrueUserId } from './platform'
import { recordAuditLog } from './audit'
import {
  isDataPlaneProvisionerConfigured,
  provisionTenantDataPlaneStack,
} from './tenant-data-plane-provision'
import { executeQuery } from './query'
import { encryptString } from './util'
import { makeProjectJwt } from './project-jwt'

type Claims = JwtPayload & Record<string, unknown>

type JwtSecretUpdateMeta = {
  change_tracking_id: string
  status: JwtSecretUpdateStatus
  progress: JwtSecretUpdateProgress
  error?: JwtSecretUpdateError | null
  updated_at: string
}

async function assertProjectAdmin(projectRef: string, gotrueId: string) {
  const row = await executeQuery<{ id: number }>({
    query: `
      select p.id
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2 and m.role in ('owner', 'admin')
      limit 1
    `,
    parameters: [projectRef, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) {
    throw new Error('Project not found or insufficient permissions to update JWT secret')
  }
}

async function persistJwtSecretUpdateMeta({
  projectRef,
  gotrueId,
  meta,
}: {
  projectRef: string
  gotrueId: string
  meta: JwtSecretUpdateMeta | null
}) {
  const r = await executeQuery({
    query: `
      update saas.projects p
      set jwt_secret_update_meta = $1::jsonb
      from saas.organization_members m
      where p.ref = $2
        and m.organization_id = p.organization_id
        and m.gotrue_id = $3
        and m.role in ('owner', 'admin')
    `,
    parameters: [meta ? JSON.stringify(meta) : null, projectRef, gotrueId],
    actorId: gotrueId,
  })
  if (r.error) throw r.error
}

async function reprovisionTenantStackIfConfigured({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}) {
  if (!isDataPlaneProvisionerConfigured()) return
  await provisionTenantDataPlaneStack({
    claims,
    ref,
    apply: true,
    reason: 'jwt_secret_update',
  })
}

export async function getProjectJwtSecretUpdateStatus({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<components['schemas']['GetJwtSecretUpdateStatus']> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const row = await executeQuery<{ jwt_secret_update_meta: JwtSecretUpdateMeta | null }>({
    query: `
      select p.jwt_secret_update_meta
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) {
    throw new Error('Project not found')
  }

  const meta = row.data[0].jwt_secret_update_meta
  if (!meta) {
    return { update_status: null }
  }

  return {
    update_status: {
      change_tracking_id: meta.change_tracking_id,
      status: meta.status,
      progress: meta.progress,
      error: meta.error ?? undefined,
    },
  }
}

export async function updateProjectJwtSecret({
  claims,
  ref,
  jwtSecret,
  changeTrackingId,
}: {
  claims: Claims
  ref: string
  jwtSecret: string
  changeTrackingId: string
}): Promise<components['schemas']['UpdateSecretsResponse']> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const secret = jwtSecret.trim()

  if (secret.length < 32) {
    throw new Error('JWT secret must be at least 32 characters')
  }
  if (!changeTrackingId.trim()) {
    throw new Error('change_tracking_id is required')
  }

  await assertProjectAdmin(ref, gotrueId)

  const startedAt = new Date().toISOString()
  const writeMeta = async (
    status: JwtSecretUpdateStatus,
    progress: JwtSecretUpdateProgress,
    error?: JwtSecretUpdateError | null
  ) => {
    await persistJwtSecretUpdateMeta({
      projectRef: ref,
      gotrueId,
      meta: {
        change_tracking_id: changeTrackingId,
        status,
        progress,
        error: error ?? null,
        updated_at: new Date().toISOString(),
      },
    })
  }

  await writeMeta(JwtSecretUpdateStatus.Updating, JwtSecretUpdateProgress.Started)

  try {
    const anonKey = makeProjectJwt(secret, 'anon', ref)
    const serviceKey = makeProjectJwt(secret, 'service_role', ref)

    const updated = await executeQuery({
      query: `
        update saas.projects p
        set
          jwt_secret_enc = $1,
          anon_key_enc = $2,
          service_key_enc = $3,
          anon_key = '',
          service_key = ''
        from saas.organization_members m
        where p.ref = $4
          and m.organization_id = p.organization_id
          and m.gotrue_id = $5
          and m.role in ('owner', 'admin')
      `,
      parameters: [
        encryptString(secret),
        encryptString(anonKey),
        encryptString(serviceKey),
        ref,
        gotrueId,
      ],
      actorId: gotrueId,
    })
    if (updated.error) throw updated.error

    await writeMeta(
      JwtSecretUpdateStatus.Updating,
      JwtSecretUpdateProgress.UpdatedAPIServicesConfiguration
    )

    try {
      await reprovisionTenantStackIfConfigured({ claims, ref })
    } catch (e) {
      await writeMeta(
        JwtSecretUpdateStatus.Failed,
        JwtSecretUpdateProgress.UpdatedAPIServicesConfiguration,
        JwtSecretUpdateError.APIServicesRestartFailed
      )
      throw e
    }

    await writeMeta(
      JwtSecretUpdateStatus.Updated,
      JwtSecretUpdateProgress.UpdatedAPIGatewayConfiguration
    )

    await recordAuditLog({
      claims,
      projectRef: ref,
      action: 'project.update',
      targetType: 'project',
      targetDescription: `JWT secret rotated for project ${ref}`,
      metadata: { change_tracking_id: changeTrackingId },
    })

    return {
      message: `JWT secret update completed (tracking id ${changeTrackingId}, started ${startedAt})`,
    }
  } catch (e) {
    if (
      !(e instanceof Error && e.message.includes('Data-plane provisioner failed'))
    ) {
      await writeMeta(
        JwtSecretUpdateStatus.Failed,
        JwtSecretUpdateProgress.Started,
        JwtSecretUpdateError.IndobaseAPIKeyUpdateFailed
      ).catch(() => undefined)
    }
    throw e
  }
}
