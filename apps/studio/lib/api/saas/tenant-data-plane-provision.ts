import type { JwtPayload } from '@indobaseinc/indobase-js'

import { executeQuery } from './query'

import {
  getTenantStackArtifacts,
  recordDataPlaneProvisionFailure,
  recordDataPlaneProvisionResultForSystem,
  recordDataPlaneProvisionSuccess,
  resolvePublicDomainForTenantStack,
} from './platform'
import { isTenantDataPlaneReachable } from './tenant-data-plane-health'
import { repairKnownTenantComposeYaml } from './tenant-compose-validation'

type Claims = JwtPayload & Record<string, unknown>

const REPAIR_COOLDOWN_MS = 2 * 60 * 1000

export function isDataPlaneProvisionerConfigured(): boolean {
  const provisionerUrl = (process.env.DATA_PLANE_PROVISIONER_URL || '').trim()
  const provisionerToken = (process.env.DATA_PLANE_PROVISIONER_TOKEN || '').trim()
  return Boolean(provisionerUrl && provisionerToken)
}

function provisionerConfig() {
  const provisionerUrl = (process.env.DATA_PLANE_PROVISIONER_URL || '').trim().replace(/\/$/, '')
  const provisionerToken = (process.env.DATA_PLANE_PROVISIONER_TOKEN || '').trim()
  if (!provisionerUrl || !provisionerToken) {
    throw new Error(
      'Data-plane provisioner is not configured. Set DATA_PLANE_PROVISIONER_URL and DATA_PLANE_PROVISIONER_TOKEN on the Studio service.'
    )
  }
  return { provisionerUrl, provisionerToken }
}

function shouldThrottleRepair(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const at = (result as { at?: string }).at
  if (!at) return false
  const ts = Date.parse(at)
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts < REPAIR_COOLDOWN_MS
}

export async function provisionTenantDataPlaneStack({
  claims,
  ref,
  apply = true,
  reason,
}: {
  claims: Claims
  ref: string
  apply?: boolean
  reason?: string
}): Promise<{ ok: true; applied: boolean; provisioner_status: number }> {
  const { provisionerUrl, provisionerToken } = provisionerConfig()

  const publicDomain = resolvePublicDomainForTenantStack()
  const artifacts = await getTenantStackArtifacts({ claims, ref, publicDomain })
  if (!artifacts) {
    throw new Error(
      'No dedicated tenant database for this project. Per-project stacks require a provisioned tenant Postgres database.'
    )
  }

  const portBase = artifacts.data_plane_port_base
  const sharedGateway = artifacts.data_plane_mode === 'shared_gateway'

  const resp = await fetch(
    `${provisionerUrl}${sharedGateway ? '/provision-shared-gateway' : '/provision'}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provisionerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        sharedGateway
          ? {
              project_ref: ref,
              docker_compose_yml: artifacts.docker_compose_yml,
              data_plane_port_base: portBase,
              apply,
            }
          : {
              project_ref: ref,
              docker_compose_yml: artifacts.docker_compose_yml,
              traefik_yml: artifacts.traefik_yml,
              apply,
            }
      ),
    }
  )

  const text = await resp.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { raw: text }
  }

  if (!resp.ok) {
    const err = new Error(
      `Data-plane provisioner failed (${resp.status}): ${
        typeof parsed === 'object' && parsed && 'message' in parsed
          ? String((parsed as { message?: unknown }).message)
          : text.slice(0, 200)
      }`
    )
    await recordDataPlaneProvisionFailure({ claims, ref, error: err, reason }).catch(() => undefined)
    throw err
  }

  const extra = typeof parsed === 'object' && parsed !== null ? parsed : {}

  if (apply) {
    const healthy = await isTenantDataPlaneReachable(ref, portBase)
    if (!healthy) {
      const err = new Error('Tenant data plane not reachable after provision')
      await recordDataPlaneProvisionFailure({ claims, ref, error: err, reason }).catch(() => undefined)
      throw err
    }
  }

  await recordDataPlaneProvisionSuccess({
    claims,
    ref,
    provisionResult: {
      ok: true,
      apply,
      ...(reason ? { reason } : {}),
      provisioner_status: resp.status,
      ...(extra as Record<string, unknown>),
    },
  })

  return { ok: true, applied: apply, provisioner_status: resp.status }
}

export async function repairTenantDataPlaneStack({
  ref,
  reason = 'repair_stack',
}: {
  ref: string
  reason?: string
}): Promise<{ ok: boolean; provisioner_status: number }> {
  const { provisionerUrl, provisionerToken } = provisionerConfig()

  const resp = await fetch(`${provisionerUrl}/repair-stack`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project_ref: ref, reason }),
  })

  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`Tenant stack repair failed (${resp.status}): ${text.slice(0, 200)}`)
  }

  let parsed: { ok?: boolean; reason?: string } = {}
  try {
    parsed = JSON.parse(text) as { ok?: boolean; reason?: string }
  } catch {
    parsed = {}
  }
  return { ok: Boolean(parsed.ok), provisioner_status: resp.status }
}

/** Stop a tenant stack without removing volumes (pause semantics). */
export async function stopTenantDataPlaneStack({
  ref,
  reason = 'project_pause',
}: {
  ref: string
  reason?: string
}): Promise<{ ok: boolean; provisioner_status: number }> {
  const { provisionerUrl, provisionerToken } = provisionerConfig()

  const resp = await fetch(`${provisionerUrl}/stop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project_ref: ref, reason }),
  })

  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`Tenant stack stop failed (${resp.status}): ${text.slice(0, 200)}`)
  }

  let parsed: { ok?: boolean } = {}
  try {
    parsed = JSON.parse(text) as { ok?: boolean }
  } catch {
    parsed = {}
  }
  return { ok: Boolean(parsed.ok), provisioner_status: resp.status }
}

/**
 * Fleet repair for all tenant directories (cron / ops). Returns counts from provisioner.
 */
export async function repairAllTenantDataPlaneStacks(): Promise<{
  ok: boolean
  provisioner_status: number
  repaired?: number
  failed?: number
}> {
  const { provisionerUrl, provisionerToken } = provisionerConfig()

  const resp = await fetch(`${provisionerUrl}/repair-fleet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`Fleet tenant repair failed (${resp.status}): ${text.slice(0, 200)}`)
  }

  let parsed: { ok?: boolean; repaired?: number; failed?: number } = {}
  try {
    parsed = JSON.parse(text) as { ok?: boolean; repaired?: number; failed?: number }
  } catch {
    parsed = {}
  }
  return {
    ok: Boolean(parsed.ok),
    provisioner_status: resp.status,
    repaired: parsed.repaired,
    failed: parsed.failed,
  }
}

/**
 * Stops the per-project Docker Compose stack, removes Traefik routing, and best-effort removes
 * the Edge Functions seed volume. Requires the same provisioner env as {@link provisionTenantDataPlaneStack}.
 * When the provisioner is not configured, returns without doing I/O.
 */
export async function teardownTenantDataPlaneStack({
  ref,
  apply = true,
}: {
  ref: string
  apply?: boolean
}): Promise<{ ok: true; applied: boolean; provisioner_status: number }> {
  const provisionerUrl = (process.env.DATA_PLANE_PROVISIONER_URL || '').trim().replace(/\/$/, '')
  const provisionerToken = (process.env.DATA_PLANE_PROVISIONER_TOKEN || '').trim()
  if (!provisionerUrl || !provisionerToken) {
    return { ok: true, applied: false, provisioner_status: 0 }
  }

  const resp = await fetch(`${provisionerUrl}/teardown`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_ref: ref,
      apply,
    }),
  })

  const text = await resp.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { raw: text }
  }

  if (!resp.ok) {
    throw new Error(
      `Data-plane provisioner teardown failed (${resp.status}): ${
        typeof parsed === 'object' && parsed && 'message' in parsed
          ? String((parsed as { message?: unknown }).message)
          : text.slice(0, 200)
      }`
    )
  }

  if (apply) {
    await repairTenantTraefikRouting(ref).catch((e) => {
      console.warn('[tenant-data-plane-provision] traefik repair after provision failed for %s: %O', ref, e)
    })
  }

  return { ok: true, applied: apply, provisioner_status: resp.status }
}

/**
 * Re-write tenant Traefik dynamic config from live docker ports (stripPrefix + correct upstream).
 * Idempotent; safe to call after every provision or on a schedule.
 */
export async function repairTenantTraefikRouting(
  ref: string
): Promise<{ ok: boolean; provisioner_status: number }> {
  const provisionerUrl = (process.env.DATA_PLANE_PROVISIONER_URL || '').trim().replace(/\/$/, '')
  const provisionerToken = (process.env.DATA_PLANE_PROVISIONER_TOKEN || '').trim()
  if (!provisionerUrl || !provisionerToken) {
    return { ok: false, provisioner_status: 0 }
  }

  const resp = await fetch(`${provisionerUrl}/repair-traefik`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project_ref: ref }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Traefik repair failed (${resp.status}): ${text.slice(0, 200)}`)
  }

  const parsed = (await resp.json().catch(() => ({}))) as { ok?: boolean }
  return { ok: Boolean(parsed.ok), provisioner_status: resp.status }
}

export async function publishTenantSiteHosting({
  files,
  ref,
}: {
  files: Record<string, string>
  ref: string
}): Promise<{ ok: boolean; provisioner_status: number; site_synced: boolean }> {
  if (!isDataPlaneProvisionerConfigured()) {
    return { ok: false, provisioner_status: 0, site_synced: false }
  }

  const { provisionerUrl, provisionerToken } = provisionerConfig()

  const resp = await fetch(`${provisionerUrl}/publish-site`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files,
      project_ref: ref,
    }),
  })

  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`Site publish failed (${resp.status}): ${text.slice(0, 300)}`)
  }

  return { ok: true, provisioner_status: resp.status, site_synced: true }
}

export async function ensureTenantSiteHosting(
  ref: string
): Promise<{ ok: boolean; patched?: boolean; provisioner_status: number }> {
  if (!isDataPlaneProvisionerConfigured()) {
    return { ok: false, provisioner_status: 0 }
  }

  const { provisionerUrl, provisionerToken } = provisionerConfig()

  const resp = await fetch(`${provisionerUrl}/ensure-site-hosting`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project_ref: ref }),
  })

  const text = await resp.text()
  let parsed: { ok?: boolean; patched?: boolean } = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = {}
  }

  if (!resp.ok) {
    throw new Error(`Ensure site hosting failed (${resp.status}): ${text.slice(0, 300)}`)
  }

  return {
    ok: Boolean(parsed.ok),
    patched: parsed.patched,
    provisioner_status: resp.status,
  }
}

export async function ensureTenantSiteHostingFleet(): Promise<{
  failed: number
  ok: boolean
  provisioner_status: number
  ready: number
}> {
  if (!isDataPlaneProvisionerConfigured()) {
    return { ok: false, provisioner_status: 0, ready: 0, failed: 0 }
  }

  const { provisionerUrl, provisionerToken } = provisionerConfig()

  const resp = await fetch(`${provisionerUrl}/ensure-site-fleet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisionerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  const text = await resp.text()
  let parsed: { ok?: boolean; ready?: number; failed?: number } = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = {}
  }

  if (!resp.ok) {
    throw new Error(`Ensure site hosting fleet failed (${resp.status}): ${text.slice(0, 300)}`)
  }

  return {
    ok: Boolean(parsed.ok),
    ready: parsed.ready ?? 0,
    failed: parsed.failed ?? 0,
    provisioner_status: resp.status,
  }
}

function claimsFromActorId(actorId: string): Claims {
  return { sub: actorId } as Claims
}

type TenantRepairRow = {
  connection_string: string | null
  connection_string_enc: string | null
  data_plane_last_provisioned_at: string | null
  data_plane_last_provision_result: unknown | null
  data_plane_port_base: number | null
}

async function loadTenantRepairRow(ref: string, actorId: string): Promise<TenantRepairRow | null> {
  const { executeQuery } = await import('./query')
  const { decryptString } = await import('./util')

  const row = await executeQuery<TenantRepairRow>({
    query: `
      select
        p.connection_string,
        p.connection_string_enc,
        p.data_plane_last_provisioned_at,
        p.data_plane_last_provision_result,
        p.data_plane_port_base
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, actorId],
    actorId,
  })
  if (row.error) throw row.error
  const p = row.data?.[0]
  if (!p) return null

  const enc = (p.connection_string_enc ?? '').trim()
  const tenantUrl = enc.length > 0 ? decryptString(enc) : p.connection_string
  if (!tenantUrl?.trim()) return null

  return p
}

/** Promote PROVISIONING → ACTIVE_HEALTHY when the data plane is already reachable. */
async function promoteProvisioningProjectIfHealthy({
  ref,
  actorId,
  portBase,
}: {
  ref: string
  actorId: string
  portBase?: number | null
}): Promise<void> {
  if (!(await isTenantDataPlaneReachable(ref, portBase))) return

  const { executeQuery } = await import('./query')
  await executeQuery({
    query: `
      update saas.projects p
      set status = 'ACTIVE_HEALTHY'
      where p.ref = $1
        and p.status = 'PROVISIONING'
        and exists (
          select 1
          from saas.organization_members m
          where m.organization_id = p.organization_id
            and m.gotrue_id = $2
            and m.role in ('owner', 'admin', 'developer')
        )
    `,
    parameters: [ref, actorId],
    actorId,
  })
}

/**
 * Idempotent heal: provision missing stacks, or restart/repair stacks that are down (502).
 * Called from getProject and can be scheduled fleet-wide.
 */
export async function ensureTenantDataPlaneHealthy({
  claims,
  ref,
  reason = 'auto_repair',
  force = false,
}: {
  claims: Claims
  ref: string
  reason?: string
  force?: boolean
}): Promise<{ repaired: boolean; action?: string }> {
  if (!isDataPlaneProvisionerConfigured()) {
    return { repaired: false }
  }

  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const actorId: string | undefined = normalized?.sub
  if (!actorId) return { repaired: false }

  const p = await loadTenantRepairRow(ref, actorId)
  if (!p) return { repaired: false }

  if (!force && shouldThrottleRepair(p.data_plane_last_provision_result)) {
    return { repaired: false }
  }

  const reachable = await isTenantDataPlaneReachable(ref, p.data_plane_port_base)
  if (reachable) {
    await promoteProvisioningProjectIfHealthy({
      ref,
      actorId,
      portBase: p.data_plane_port_base,
    })
    return { repaired: false }
  }

  try {
    if (p.data_plane_last_provisioned_at) {
      await repairTenantDataPlaneStack({ ref, reason })
    } else {
      await provisionTenantDataPlaneStack({ claims, ref, apply: true, reason })
      const { ensureTenantGoTrueAuthSchemaForActor } = await import('./tenant-gotrue-schema')
      await ensureTenantGoTrueAuthSchemaForActor({ ref, actorId })
    }

    const ok = await isTenantDataPlaneReachable(ref, p.data_plane_port_base)
    if (ok) {
      await recordDataPlaneProvisionSuccess({
        claims,
        ref,
        provisionResult: { ok: true, reason, action: 'auto_repair' },
      })
      await promoteProvisioningProjectIfHealthy({
        ref,
        actorId,
        portBase: p.data_plane_port_base,
      })
      return { repaired: true, action: p.data_plane_last_provisioned_at ? 'repair_stack' : 'provision' }
    }

    await recordDataPlaneProvisionFailure({
      claims,
      ref,
      error: new Error('Tenant data plane still unreachable after repair'),
      reason,
    })
    return { repaired: false }
  } catch (e) {
    await recordDataPlaneProvisionFailure({ claims, ref, error: e, reason }).catch(() => undefined)
    throw e
  }
}

type FleetRepairRow = {
  ref: string
  data_plane_last_provision_result: unknown | null
  data_plane_last_provisioned_at: string | null
  data_plane_port_base: number | null
}

/**
 * Fleet / cron heal: repair dedicated-DB projects that are unreachable or marked failed.
 * Safe to run on a schedule from `/api/cron/data-plane-repair`.
 */
export async function repairUnhealthyTenantDataPlaneStacks({
  projectRef,
  limit = 25,
  fleetPass = true,
}: {
  projectRef?: string
  limit?: number
  fleetPass?: boolean
} = {}): Promise<{
  checked: number
  repaired: number
  still_unhealthy: number
  fleet?: { ok: boolean; repaired?: number; failed?: number }
  results: Array<{ ref: string; action: string; ok?: boolean }>
}> {
  if (!isDataPlaneProvisionerConfigured()) {
    return { checked: 0, repaired: 0, still_unhealthy: 0, results: [] }
  }

  let fleet: { ok: boolean; repaired?: number; failed?: number } | undefined
  if (fleetPass && !projectRef) {
    try {
      fleet = await repairAllTenantDataPlaneStacks()
    } catch (e) {
      console.warn('[tenant-data-plane-provision] fleet repair pass failed: %O', e)
    }
  }

  const rows = await executeQuery<FleetRepairRow>({
    query: `
      select
        p.ref,
        p.data_plane_last_provision_result,
        p.data_plane_last_provisioned_at,
        p.data_plane_port_base
      from saas.projects p
      where p.is_branch = false
        and coalesce(trim(p.connection_string_enc), '') <> ''
        ${projectRef ? 'and p.ref = $1' : ''}
      order by
        case when (p.data_plane_last_provision_result->>'ok') = 'false' then 0 else 1 end,
        p.updated_at desc nulls last
      limit $${projectRef ? 2 : 1}
    `,
    parameters: projectRef ? [projectRef, Math.min(Math.max(limit, 1), 100)] : [Math.min(Math.max(limit, 1), 100)],
  })
  if (rows.error) throw rows.error

  const results: Array<{ ref: string; action: string; ok?: boolean }> = []
  let repaired = 0
  let stillUnhealthy = 0

  for (const row of rows.data ?? []) {
    const lastResult = row.data_plane_last_provision_result
    const markedFailed =
      lastResult &&
      typeof lastResult === 'object' &&
      (lastResult as { ok?: boolean }).ok === false
    const reachable = await isTenantDataPlaneReachable(row.ref, row.data_plane_port_base)

    if (reachable && !markedFailed) {
      results.push({ ref: row.ref, action: 'healthy', ok: true })
      continue
    }

    try {
      if (row.data_plane_last_provisioned_at) {
        await repairTenantDataPlaneStack({ ref: row.ref, reason: 'cron_auto_repair' })
      } else {
        results.push({ ref: row.ref, action: 'skipped_no_prior_provision' })
        stillUnhealthy++
        continue
      }

      const ok = await isTenantDataPlaneReachable(row.ref, row.data_plane_port_base)
      await recordDataPlaneProvisionResultForSystem({
        ref: row.ref,
        provisionResult: {
          ok,
          reason: 'cron_auto_repair',
          action: 'repair_stack',
          at: new Date().toISOString(),
        },
      })

      if (ok) {
        repaired++
        results.push({ ref: row.ref, action: 'repaired', ok: true })
      } else {
        stillUnhealthy++
        results.push({ ref: row.ref, action: 'still_unhealthy', ok: false })
      }
    } catch (e) {
      stillUnhealthy++
      const message = e instanceof Error ? e.message : String(e)
      await recordDataPlaneProvisionResultForSystem({
        ref: row.ref,
        provisionResult: {
          ok: false,
          reason: 'cron_auto_repair',
          error: message.slice(0, 500),
          at: new Date().toISOString(),
        },
      }).catch(() => undefined)
      results.push({ ref: row.ref, action: `error:${message.slice(0, 120)}`, ok: false })
    }
  }

  return {
    checked: rows.data?.length ?? 0,
    repaired,
    still_unhealthy: stillUnhealthy,
    fleet,
    results,
  }
}

/** Fire-and-forget repair for projects shown with a data-plane error badge. */
export function scheduleDataPlaneRepairForProjectRefs(
  refs: string[],
  actorId: string,
  reason = 'list_projects_auto_repair'
): void {
  if (!isDataPlaneProvisionerConfigured() || refs.length === 0) return
  const claims = { sub: actorId } as Claims
  for (const ref of refs.slice(0, 5)) {
    void ensureTenantDataPlaneHealthy({ claims, ref, reason, force: true }).catch((e) => {
      console.warn('[tenant-data-plane-provision] background repair for %s failed: %O', ref, e)
    })
  }
}

/** @deprecated Use {@link ensureTenantDataPlaneHealthy} */
export async function ensureDataPlaneProvisionedIfMissing({
  claims,
  ref,
  reason = 'auto_repair',
}: {
  claims: Claims
  ref: string
  reason?: string
}): Promise<{ repaired: boolean }> {
  const result = await ensureTenantDataPlaneHealthy({ claims, ref, reason })
  return { repaired: result.repaired }
}

export async function ensureDataPlaneProvisionedIfMissingForActor({
  ref,
  actorId,
  reason,
}: {
  ref: string
  actorId: string
  reason?: string
}) {
  return ensureTenantDataPlaneHealthy({
    claims: claimsFromActorId(actorId),
    ref,
    reason,
  })
}

// Re-export for provisioner-side compose patching parity
export { repairKnownTenantComposeYaml }
