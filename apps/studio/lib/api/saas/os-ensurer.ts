/**
 * Capability Ensurer — lazy provision when OS user requests auth/database/etc.
 */
import { makeRandomString } from 'lib/helpers'

import { buildBuilderBackendConfig, getStudioOrigin } from './builder-launch'
import { encryptString } from './util'
import { generateProjectJwtSecret, makeProjectJwt } from './project-jwt'
import {
  finalizeDedicatedProjectProvisioning,
  getGotrueUserId,
  type Claims,
} from './platform'
import {
  getOsWorkspace,
  OS_NATIVE_DATA_PLANE_MODE,
  OS_NATIVE_STATUS,
  type OsWorkspaceRecord,
} from './os-workspace'
import { getProjectSettingsForRef } from './settings'
import { ensureTenantDataPlaneHealthy } from './tenant-data-plane-provision'

const CAPABILITY_ALIASES: Record<string, string> = {
  auth: 'auth',
  login: 'auth',
  database: 'businessData',
  db: 'businessData',
  businessData: 'businessData',
  storage: 'storage',
  functions: 'functions',
  commerce: 'commerce',
  payments: 'commerce',
  analytics: 'events',
  email: 'email',
}

function normalizeCapability(raw: string): string {
  const key = raw.trim()
  return CAPABILITY_ALIASES[key] ?? key
}

async function upgradeOsWorkspace({
  claims,
  workspace,
}: {
  claims: Claims
  workspace: OsWorkspaceRecord
}): Promise<void> {
  const gotrueId = getGotrueUserId(claims)
  const ref = workspace.ref

  if (workspace.provision_state === 'ready' && workspace.data_plane_mode !== OS_NATIVE_DATA_PLANE_MODE) {
    return
  }

  const jwtSecret = generateProjectJwtSecret()
  const anonKey = makeProjectJwt(jwtSecret, 'anon', ref)
  const serviceKey = makeProjectJwt(jwtSecret, 'service_role', ref)
  const dbPass = makeRandomString(24)

  const { executeQuery } = await import('./query')
  const updated = await executeQuery({
    query: `
      update saas.projects p
      set status = 'PROVISIONING',
          data_plane_mode = 'isolated_stack',
          jwt_secret_enc = $2,
          anon_key_enc = $3,
          service_key_enc = $4,
          db_pass_enc = $5,
          auth_config = coalesce(auth_config, '{}'::jsonb) || '{"provision_state":"provisioning"}'::jsonb
      where p.ref = $1
        and exists (
          select 1 from saas.organization_members m
          where m.organization_id = p.organization_id and m.gotrue_id = $6
        )
    `,
    parameters: [
      ref,
      encryptString(jwtSecret),
      encryptString(anonKey),
      encryptString(serviceKey),
      encryptString(dbPass),
      gotrueId,
    ],
    actorId: gotrueId,
  })
  if (updated.error) throw updated.error

  await finalizeDedicatedProjectProvisioning({
    projectRef: ref,
    gotrueId,
    deleteOnFailure: false,
    userDbPass: dbPass,
  })

  await ensureTenantDataPlaneHealthy({
    claims,
    ref,
    reason: 'os_ensurer',
    force: true,
  })
}

export async function ensureOsCapability({
  claims,
  workspaceRef,
  capability,
}: {
  claims: Claims
  workspaceRef: string
  capability: string
}): Promise<{
  ok: boolean
  capability: string
  provision_state: string
  backend?: ReturnType<typeof buildBuilderBackendConfig> | null
  message?: string
}> {
  const normalized = normalizeCapability(capability)
  const workspace = await getOsWorkspace({ claims, ref: workspaceRef })
  if (!workspace) {
    throw new Error('Workspace not found')
  }

  const needsBackend = ['auth', 'businessData', 'storage', 'functions', 'commerce', 'events'].includes(
    normalized,
  )

  if (needsBackend && workspace.provision_state === 'none') {
    await upgradeOsWorkspace({ claims, workspace })
  } else if (needsBackend && workspace.status === OS_NATIVE_STATUS) {
    await upgradeOsWorkspace({ claims, workspace })
  } else if (needsBackend) {
    await ensureTenantDataPlaneHealthy({
      claims,
      ref: workspaceRef,
      reason: `os_ensure_${normalized}`,
      force: false,
    })
  }

  const refreshed = await getOsWorkspace({ claims, ref: workspaceRef })
  const provisionState = refreshed?.provision_state ?? 'none'

  if (!needsBackend) {
    return {
      ok: true,
      capability: normalized,
      provision_state: provisionState,
      message: `Capability ${normalized} noted — no backend required yet.`,
    }
  }

  try {
    const settings = await getProjectSettingsForRef({ claims, ref: workspaceRef })
    if (!settings) {
      return {
        ok: true,
        capability: normalized,
        provision_state: 'provisioning',
        message: 'Backend is provisioning — try again shortly.',
      }
    }

    const studioUrl = getStudioOrigin() || 'https://studio.indobase.in'
    const backend = buildBuilderBackendConfig({
      projectName: refreshed?.name || workspaceRef,
      projectRef: workspaceRef,
      settings,
      studioUrl,
    })

    return {
      ok: true,
      capability: normalized,
      provision_state: 'ready',
      backend,
    }
  } catch (err) {
    return {
      ok: false,
      capability: normalized,
      provision_state: provisionState,
      message: err instanceof Error ? err.message : 'Ensurer failed',
    }
  }
}
