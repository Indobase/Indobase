import type { JwtPayload } from '@indobaseinc/indobase-js'
import type { components } from 'api-types'

import { PROJECT_REST_URL } from 'lib/constants/api'
import { getProject, getGotrueUserId } from './platform'
import { restoreProjectForActor } from './project-lifecycle'
import { repairTenantDataPlaneStack } from './tenant-data-plane-provision'
import { resolveSaaSTenantRestUrls } from './tenant-public-urls'
import { executeQuery } from './query'
import { decryptString } from './util'

type Claims = JwtPayload & Record<string, any>
export type ServiceHealthResponse = Omit<
  components['schemas']['V1ServiceHealthResponse'],
  'healthy'
>

const CORE_SERVICES = ['auth', 'realtime', 'rest', 'storage', 'db'] as const
type CoreService = (typeof CORE_SERVICES)[number]

const DEFAULT_SERVICES: CoreService[] = ['auth', 'realtime', 'rest', 'storage', 'db']

function serviceResponse(
  name: CoreService,
  status: ServiceHealthResponse['status'],
  error?: string
): ServiceHealthResponse {
  return {
    name,
    status,
    healthy: status === 'ACTIVE_HEALTHY',
    error,
    info: undefined,
  } as ServiceHealthResponse
}

async function pingUrl(url: string, timeoutMs = 4000): Promise<{ ok: boolean; error?: string }> {
  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined

    const response = await fetch(url, { method: 'HEAD', cache: 'no-store', signal })
    // Kong/PostgREST often return 401 on unauthenticated HEAD; that still means the service is up.
    if (response.ok || response.status === 401 || response.status === 404) {
      return { ok: true }
    }
    return { ok: false, error: `upstream responded ${response.status}` }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'request failed',
    }
  }
}

function restOriginFromUrl(restUrl: string): string {
  try {
    const u = new URL(restUrl)
    return `${u.protocol}//${u.host}`
  } catch {
    return restUrl.replace(/\/rest\/v1\/?$/, '')
  }
}

function traefikUpstreamHost(): string {
  return process.env.TRAEFIK_UPSTREAM_HOST?.trim() || '172.17.0.1'
}

async function loadProjectHealthRow({ claims, ref }: { claims: Claims; ref: string }) {
  const gotrueId = getGotrueUserId(claims)
  return executeQuery<{
    data_plane_last_provisioned_at: string | null
    data_plane_port_base: number | null
    connection_string: string | null
    connection_string_enc: string | null
    status: string
    pause_reason: string | null
  }>({
    query: `
      select
        p.data_plane_last_provisioned_at,
        p.data_plane_port_base,
        p.connection_string,
        p.connection_string_enc,
        p.status,
        p.pause_reason
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
}

/*
 * ── Wake-on-visit ───────────────────────────────────────────────────────────────────────────────
 *
 * Stacks get STOPPED legitimately (idle sleep per plan, the host capacity valve, a VPS reboot),
 * but nothing woke them again: every probe failed and the dashboard showed six "Unhealthy" rows
 * forever. Per the pricing model, sleeping is normal and opening the dashboard IS activity — so a
 * failed probe on a stack that *should* be runnable triggers an automatic wake, and the UI reports
 * COMING_UP ("can take up to 5 minutes") instead of a dead-end UNHEALTHY.
 *
 * Quota-paused projects are excluded: those must stay paused until the violation clears.
 */
const WAKE_DEBOUNCE_MS = 90_000
const wakeAttempts = new Map<string, number>()

function isAutoWakeEligible(status: string | undefined, pauseReason: string | null | undefined): boolean {
  if (status === 'ACTIVE_HEALTHY' || status === 'COMING_UP') return true

  // Idle-slept projects wake on use; quota/system pauses stay paused.
  if (status === 'INACTIVE' || status === 'PAUSED') {
    return (pauseReason ?? '').startsWith('idle_sleep_')
  }
  return false
}

function triggerWake({ claims, ref, status }: { claims: Claims; ref: string; status: string | undefined }): boolean {
  const last = wakeAttempts.get(ref) ?? 0
  const withinDebounce = Date.now() - last < WAKE_DEBOUNCE_MS
  if (withinDebounce) return true // a wake is already in flight — still report COMING_UP

  wakeAttempts.set(ref, Date.now())

  /*
   * Status ACTIVE_HEALTHY with dead probes means the CONTAINERS are stopped while the DB row still
   * says healthy (capacity valve, VPS reboot). restoreProjectForActor early-returns on that status,
   * so it must not be the entry point here — repair the stack directly. For genuinely paused rows
   * (idle sleep) use the restore path, which fixes the status and audit-logs the restore.
   */
  const wake =
    status === 'ACTIVE_HEALTHY'
      ? repairTenantDataPlaneStack({ ref, reason: 'wake_on_dashboard' })
      : restoreProjectForActor({ claims, ref })

  // Fire-and-forget: compose up can take tens of seconds and the health response must stay fast.
  void Promise.resolve(wake).catch((err) => {
    console.warn(`[project-health] auto-wake failed for ${ref}:`, err instanceof Error ? err.message : err)
    // Allow a retry on the next poll rather than sitting out the full debounce window.
    wakeAttempts.delete(ref)
  })

  return true
}

/** Direct container ports (bypasses Traefik + wildcard DNS). */
async function probeCoreServicesViaPortBase(
  portBase: number
): Promise<Record<CoreService, { ok: boolean; error?: string }>> {
  const host = traefikUpstreamHost()
  const restPort = portBase + 1
  const authPort = portBase + 2
  const storagePort = portBase + 3
  const realtimePort = portBase + 4

  const [rest, auth, storage, realtime] = await Promise.all([
    pingUrl(`http://${host}:${restPort}/`),
    pingUrl(`http://${host}:${authPort}/health`),
    pingUrl(`http://${host}:${storagePort}/status`),
    pingUrl(`http://${host}:${realtimePort}/`),
  ])

  const db = rest.ok
    ? { ok: true as const }
    : { ok: false as const, error: rest.error ?? 'database unreachable via REST' }

  return { rest, auth, storage, realtime, db }
}

async function probeCoreServices(restUrl: string): Promise<Record<CoreService, { ok: boolean; error?: string }>> {
  const origin = restOriginFromUrl(restUrl)
  const [rest, auth, storage, realtime] = await Promise.all([
    pingUrl(restUrl.endsWith('/') ? restUrl : `${restUrl}/`),
    pingUrl(`${origin}/auth/v1/health`),
    pingUrl(`${origin}/storage/v1/status`),
    pingUrl(`${origin}/realtime/v1/`),
  ])

  // PostgREST reaching the DB is a practical signal for database availability on tenant stacks.
  const db = rest.ok ? { ok: true as const } : { ok: false as const, error: rest.error ?? 'database unreachable via REST' }

  return { rest, auth, storage, realtime, db }
}

async function resolveCoreServiceProbes(opts: {
  restUrl: string
  portBase: number | null | undefined
  hasDedicated: boolean
  hasProvisionedDataPlane: boolean
}): Promise<Record<CoreService, { ok: boolean; error?: string }>> {
  const useInternal =
    process.env.SAAS_HEALTH_PROBE_INTERNAL !== 'false' &&
    opts.hasDedicated &&
    opts.hasProvisionedDataPlane &&
    typeof opts.portBase === 'number' &&
    Number.isFinite(opts.portBase) &&
    opts.portBase >= 1024

  if (useInternal) {
    return probeCoreServicesViaPortBase(opts.portBase!)
  }
  return probeCoreServices(opts.restUrl)
}

export async function getSaaSProjectServiceHealth({
  claims,
  ref,
  services = DEFAULT_SERVICES,
}: {
  claims: Claims
  ref: string
  services?: CoreService[]
}): Promise<ServiceHealthResponse[] | null> {
  const project = await getProject({ claims, ref })
  if (!project) return null

  const row = await loadProjectHealthRow({ claims, ref })
  if (row.error) throw row.error

  const meta = row.data?.[0]
  const tenantDbUrl =
    meta?.connection_string_enc?.trim()
      ? decryptString(meta.connection_string_enc)
      : meta?.connection_string
  const hasDedicated = Boolean(tenantDbUrl?.trim())
  const hasProvisionedDataPlane = Boolean(meta?.data_plane_last_provisioned_at)
  const awaitingDedicatedDataPlane = hasDedicated && !hasProvisionedDataPlane

  const requested = services.filter((s): s is CoreService =>
    (CORE_SERVICES as readonly string[]).includes(s)
  )

  const restUrl =
    project.restUrl?.trim() ||
    resolveSaaSTenantRestUrls(ref, hasDedicated && (hasProvisionedDataPlane || awaitingDedicatedDataPlane))
      .restUrl ||
    PROJECT_REST_URL

  const portBase = meta?.data_plane_port_base ?? null

  if (awaitingDedicatedDataPlane || meta?.status === 'COMING_UP') {
    const probes = await resolveCoreServiceProbes({
      restUrl,
      portBase,
      hasDedicated,
      hasProvisionedDataPlane,
    })

    // A project stuck COMING_UP (a wake died mid-way) must keep retrying, not poll forever.
    // triggerWake's debounce makes this a no-op while a wake is genuinely in flight.
    if (
      meta?.status === 'COMING_UP' &&
      hasDedicated &&
      hasProvisionedDataPlane &&
      requested.some((name) => !probes[name].ok)
    ) {
      triggerWake({ claims, ref, status: meta.status })
    }

    return requested.map((name) => {
      const probe = probes[name]
      if (probe.ok) return serviceResponse(name, 'ACTIVE_HEALTHY')
      return serviceResponse(name, 'COMING_UP', probe.error)
    })
  }

  const probes = await resolveCoreServiceProbes({
    restUrl,
    portBase,
    hasDedicated,
    hasProvisionedDataPlane,
  })

  const failures = requested.filter((name) => !probes[name].ok)
  const canWake = hasDedicated && hasProvisionedDataPlane
  const wakeEligible = canWake && isAutoWakeEligible(meta?.status, meta?.pause_reason)

  // Every probe down on a runnable stack = it is stopped (idle sleep, capacity valve, reboot).
  // Wake it and report COMING_UP so the dashboard shows "starting", not a dead-end Unhealthy.
  if (failures.length === requested.length && requested.length > 0 && wakeEligible) {
    triggerWake({ claims, ref, status: meta?.status })
    return requested.map((name) => serviceResponse(name, 'COMING_UP', 'waking from sleep'))
  }

  // Partial failure = the stack is up but a container crashed. Repair in the background
  // (compose up is idempotent and only restarts dead services) but report honestly.
  if (failures.length > 0 && wakeEligible) {
    triggerWake({ claims, ref, status: meta?.status })
  }

  return requested.map((name) => {
    const probe = probes[name]
    if (probe.ok) return serviceResponse(name, 'ACTIVE_HEALTHY')
    return serviceResponse(name, 'UNHEALTHY', probe.error)
  })
}

export async function getSaaSEdgeFunctionsHealth({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<{ healthy: boolean } | null> {
  const project = await getProject({ claims, ref })
  if (!project) return null

  const row = await loadProjectHealthRow({ claims, ref })
  if (row.error) throw row.error

  const meta = row.data?.[0]
  const tenantDbUrl =
    meta?.connection_string_enc?.trim()
      ? decryptString(meta.connection_string_enc)
      : meta?.connection_string
  const hasDedicated = Boolean(tenantDbUrl?.trim())
  const hasProvisionedDataPlane = Boolean(meta?.data_plane_last_provisioned_at)
  const awaitingDedicatedDataPlane = hasDedicated && !hasProvisionedDataPlane

  const restUrl =
    project.restUrl?.trim() ||
    resolveSaaSTenantRestUrls(ref, hasDedicated && (hasProvisionedDataPlane || awaitingDedicatedDataPlane))
      .restUrl ||
    PROJECT_REST_URL

  const portBase = meta?.data_plane_port_base ?? null
  const useInternal =
    process.env.SAAS_HEALTH_PROBE_INTERNAL !== 'false' &&
    hasDedicated &&
    hasProvisionedDataPlane &&
    typeof portBase === 'number' &&
    Number.isFinite(portBase) &&
    portBase >= 1024

  if (useInternal) {
    const functionsUrl = `http://${traefikUpstreamHost()}:${portBase! + 5}/`
    const probe = await pingUrl(functionsUrl)
    if (probe.ok) return { healthy: true }
    // Edge runtime responds 400 on root when no function name is provided; process is still up.
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(4000)
          : undefined
      const response = await fetch(functionsUrl, { method: 'HEAD', cache: 'no-store', signal })
      return { healthy: response.status === 400 }
    } catch {
      return { healthy: false }
    }
  }

  if (awaitingDedicatedDataPlane) {
    const probe = await pingUrl(`${restOriginFromUrl(restUrl)}/functions/v1/`)
    return { healthy: probe.ok }
  }
  const origin = restOriginFromUrl(restUrl)
  const probe = await pingUrl(`${origin}/functions/v1/`)
  return { healthy: probe.ok }
}
