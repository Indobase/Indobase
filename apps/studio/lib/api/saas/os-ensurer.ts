/**
 * Capability Ensurer — Lane 2 backend enable via Capability Orchestrator (ADR 0006).
 * Customer copy: Enable Login / Business Data / Payments — never “connect” a provider.
 *
 * Commerce / email: data-plane ready is not “live”. Adapter returns pending_setup and
 * a product handoff URL when minting succeeds.
 */
import { makeRandomString } from 'lib/helpers'
import {
  createCapabilityOrchestrator,
  normalizeCapabilityId,
  type CapabilityEnsureResult,
  type CapabilityProviderAdapter,
} from '@indobase/platform'

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
import { getOrganizationPlanByProjectRef } from './plan-metering'
import {
  assertOsEnsureAccess,
  throwOsEnsureDenial,
  type OsEnsureAccessDenial,
} from './os-ensurer-access'
import { AUTH_LOGIN_MAIL_NEXT_STEP } from './os-product-auth-mail'
import { finalizeProductCapabilityEnsure } from './os-ensurer-product-setup'

export {
  assertOsAccountForEnsure,
  assertOsEnsureAccess,
  throwOsEnsureDenial,
  type OsEnsureAccessDenial,
} from './os-ensurer-access'

export { finalizeProductCapabilityEnsure } from './os-ensurer-product-setup'

function normalizeCapability(raw: string): string {
  return normalizeCapabilityId(raw) ?? raw.trim()
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

  const planRaw = await getOrganizationPlanByProjectRef(ref)
  const access = assertOsEnsureAccess({ gotrueId, workspaceRef: ref, plan: planRaw })
  if (!access.ok) throwOsEnsureDenial(access)

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
  capabilityId: string
  customer_label: string
  status: CapabilityEnsureResult['status']
  provision_state: string
  backend?: ReturnType<typeof buildBuilderBackendConfig> | null
  message: string
  launch_url?: string | null
  setup_status?: 'pending' | 'ready'
  next_steps?: Array<{ id: string; label: string; path?: string }>
}> {
  const adapter = createStudioDataPlaneCapabilityAdapter({ claims, workspaceRef })
  const orch = createCapabilityOrchestrator(adapter)
  const result = await orch.ensure({ businessRef: workspaceRef, capability })

  let backend: ReturnType<typeof buildBuilderBackendConfig> | null | undefined
  if (result.ok && result.status === 'enabled') {
    try {
      const settings = await getProjectSettingsForRef({ claims, ref: workspaceRef })
      if (settings) {
        const studioUrl = getStudioOrigin() || 'https://studio.indobase.in'
        const refreshed = await getOsWorkspace({ claims, ref: workspaceRef })
        backend = buildBuilderBackendConfig({
          projectName: refreshed?.name || workspaceRef,
          projectRef: workspaceRef,
          settings,
          studioUrl,
        })
      }
    } catch {
      backend = undefined
    }
  }

  const next_steps =
    result.ok && result.status === 'enabled' && result.capabilityId === 'auth'
      ? [AUTH_LOGIN_MAIL_NEXT_STEP]
      : undefined

  return {
    ok: result.ok,
    capability: result.capabilityId,
    capabilityId: result.capabilityId,
    customer_label: result.customerLabel,
    status: result.status,
    provision_state: result.provisionState || 'none',
    backend,
    message: result.message,
    ...(result.launchUrl !== undefined ? { launch_url: result.launchUrl } : {}),
    ...(result.setupStatus !== undefined ? { setup_status: result.setupStatus } : {}),
    ...(next_steps ? { next_steps } : {}),
  }
}

/**
 * Hidden adapter: current tenant data-plane provisioner.
 * Swap later without changing Orchestrator or customer copy (ADR 0006).
 */
function createStudioDataPlaneCapabilityAdapter({
  claims,
  workspaceRef,
}: {
  claims: Claims
  workspaceRef: string
}): CapabilityProviderAdapter {
  return {
    async ensure({ capabilityId }) {
      const normalized = normalizeCapability(capabilityId)
      const workspace = await getOsWorkspace({ claims, ref: workspaceRef })
      if (!workspace) {
        throw new Error('Workspace not found')
      }

      const needsBackend = [
        'auth',
        'businessData',
        'storage',
        'functions',
        'commerce',
        'events',
        'email',
      ].includes(normalized)

      if (!needsBackend) {
        return { ok: true, state: 'ready', setupStatus: 'ready' }
      }

      if (workspace.provision_state === 'none') {
        await upgradeOsWorkspace({ claims, workspace })
      } else if (workspace.status === OS_NATIVE_STATUS) {
        await upgradeOsWorkspace({ claims, workspace })
      } else {
        await ensureTenantDataPlaneHealthy({
          claims,
          ref: workspaceRef,
          reason: `os_ensure_${normalized}`,
          force: false,
        })
      }

      const refreshed = await getOsWorkspace({ claims, ref: workspaceRef })
      const provisionState = refreshed?.provision_state ?? 'none'

      if (provisionState === 'provisioning') {
        return { ok: true, state: 'provisioning' }
      }

      try {
        const settings = await getProjectSettingsForRef({ claims, ref: workspaceRef })
        if (!settings) {
          return { ok: true, state: 'provisioning' }
        }
        return finalizeProductCapabilityEnsure({
          claims,
          workspaceRef,
          capabilityId: normalized,
        })
      } catch (err) {
        return {
          ok: false,
          state: 'failed',
          detail: err instanceof Error ? err.message : 'Ensurer failed',
        }
      }
    },
  }
}
