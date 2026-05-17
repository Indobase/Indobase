import type { JwtPayload } from 'indobase-js'
import type { components } from 'api-types'

import { PROJECT_REST_URL } from 'lib/constants/api'
import { getProject, getGotrueUserId } from './platform'
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

async function loadProjectHealthRow({ claims, ref }: { claims: Claims; ref: string }) {
  const gotrueId = getGotrueUserId(claims)
  return executeQuery<{
    data_plane_last_provisioned_at: string | null
    connection_string: string | null
    connection_string_enc: string | null
    status: string
  }>({
    query: `
      select
        p.data_plane_last_provisioned_at,
        p.connection_string,
        p.connection_string_enc,
        p.status
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
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

  if (awaitingDedicatedDataPlane || meta?.status === 'COMING_UP') {
    const probes = await probeCoreServices(restUrl)
    return requested.map((name) => {
      const probe = probes[name]
      if (probe.ok) return serviceResponse(name, 'ACTIVE_HEALTHY')
      return serviceResponse(name, 'COMING_UP', probe.error)
    })
  }

  const probes = await probeCoreServices(restUrl)

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

  if (awaitingDedicatedDataPlane) {
    const probe = await pingUrl(`${restOriginFromUrl(restUrl)}/functions/v1/`)
    return { healthy: probe.ok }
  }
  const origin = restOriginFromUrl(restUrl)
  const probe = await pingUrl(`${origin}/functions/v1/`)
  return { healthy: probe.ok }
}
