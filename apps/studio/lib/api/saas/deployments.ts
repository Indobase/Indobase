import type { JwtPayload } from '@indobaseinc/indobase-js'

import { recordAuditLog } from './audit'
import { resolveBuilderHandoffSecret } from './builder-launch'
import { getProjectHostingForRef } from './hosting'
import { ensureSaasTables, getGotrueUserId } from './platform'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, unknown>

export type ProjectDeploymentStatus = 'requested' | 'building' | 'ready' | 'failed' | 'archived'
export type ProjectDeploymentRequestedVia = 'studio' | 'builder' | 'api'
export type ProjectDeploymentLogLevel = 'info' | 'warning' | 'error'
export type ProjectDeploymentLogSource = 'api' | 'builder' | 'runtime' | 'studio'

export type ProjectDeploymentLog = {
  level: ProjectDeploymentLogLevel
  message: string
  source: ProjectDeploymentLogSource
  timestamp: string
}

export type ProjectDeploymentHealthCheck = {
  checked_at: string
  duration_ms: number
  error: string | null
  final_url: string | null
  method: 'GET' | 'HEAD'
  ok: boolean
  status_code: number | null
}

export type ProcessProjectDeploymentResult = {
  deployment: ProjectDeployment | null
  health: ProjectDeploymentHealthCheck | null
  outcome: 'failed' | 'idle' | 'ready'
}

export type ProcessProjectDeploymentBatchResult = {
  failed: number
  idle: boolean
  processed: number
  ready: number
  results: ProcessProjectDeploymentResult[]
}

export type ProjectDeployment = {
  completed_at: string | null
  custom_domain_hostname: string | null
  id: string
  inserted_at: string
  last_error: string | null
  logs: ProjectDeploymentLog[]
  metadata: Record<string, unknown>
  project_ref: string
  requested_by_gotrue_id: string
  requested_via: ProjectDeploymentRequestedVia
  status: ProjectDeploymentStatus
  target_url: string
  updated_at: string
}

type ProjectDeploymentRow = {
  completed_at: string | null
  custom_domain_hostname: string | null
  id: string
  inserted_at: string
  last_error: string | null
  logs: ProjectDeploymentLog[] | null
  metadata: Record<string, unknown> | null
  project_ref: string
  requested_by_gotrue_id: string
  requested_via: ProjectDeploymentRequestedVia
  status: ProjectDeploymentStatus
  target_url: string
  updated_at: string
}

function mapDeploymentRow(row: ProjectDeploymentRow): ProjectDeployment {
  return {
    completed_at: row.completed_at,
    custom_domain_hostname: row.custom_domain_hostname,
    id: row.id,
    inserted_at: row.inserted_at,
    last_error: row.last_error,
    logs: row.logs ?? [],
    metadata: row.metadata ?? {},
    project_ref: row.project_ref,
    requested_by_gotrue_id: row.requested_by_gotrue_id,
    requested_via: row.requested_via,
    status: row.status,
    target_url: row.target_url,
    updated_at: row.updated_at,
  }
}

const TERMINAL_PROJECT_DEPLOYMENT_STATUSES: ProjectDeploymentStatus[] = ['archived', 'failed', 'ready']
const PROJECT_DEPLOYMENT_EXECUTOR_MAX_CLAIM_ATTEMPTS = 5
const PROJECT_DEPLOYMENT_DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000
const PROJECT_DEPLOYMENT_DEFAULT_WORKER_ID = 'studio_internal_executor'
const PROJECT_DEPLOYMENT_TRANSITIONS: Record<ProjectDeploymentStatus, ProjectDeploymentStatus[]> = {
  archived: [],
  building: ['ready', 'failed', 'archived'],
  failed: ['archived'],
  ready: ['archived'],
  requested: ['building', 'failed', 'archived'],
}

export function isValidProjectDeploymentTransition(
  currentStatus: ProjectDeploymentStatus,
  nextStatus: ProjectDeploymentStatus,
) {
  if (currentStatus === nextStatus) {
    return true
  }

  return PROJECT_DEPLOYMENT_TRANSITIONS[currentStatus].includes(nextStatus)
}

function assertValidProjectDeploymentTransition(
  currentStatus: ProjectDeploymentStatus,
  nextStatus: ProjectDeploymentStatus,
) {
  if (!isValidProjectDeploymentTransition(currentStatus, nextStatus)) {
    throw new Error(`Invalid deployment status transition: ${currentStatus} -> ${nextStatus}`)
  }
}

function buildProjectDeploymentLog({
  level = 'info',
  message,
  source,
}: {
  level?: ProjectDeploymentLogLevel
  message: string
  source: ProjectDeploymentLogSource
}): ProjectDeploymentLog {
  const cleanMessage = message.trim()

  if (!cleanMessage) {
    throw new Error('Deployment log message is required')
  }

  return {
    level,
    message: cleanMessage,
    source,
    timestamp: new Date().toISOString(),
  }
}

function appendProjectDeploymentLogs(
  existingLogs: ProjectDeploymentLog[] | null | undefined,
  nextLog?: ProjectDeploymentLog,
) {
  if (!nextLog) {
    return existingLogs ?? []
  }

  const logs = [...(existingLogs ?? []), nextLog]
  return logs.slice(-200)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0
}

function projectDeploymentProbeTimeoutMs() {
  const raw = process.env.PROJECT_DEPLOYMENT_PROBE_TIMEOUT_MS?.trim()
  const parsed = raw ? parseInt(raw, 10) : NaN

  if (Number.isFinite(parsed) && parsed >= 1000) {
    return parsed
  }

  return 12000
}

function projectDeploymentStaleAfterMs() {
  const raw = process.env.PROJECT_DEPLOYMENT_STALE_AFTER_MS?.trim()
  const parsed = raw ? parseInt(raw, 10) : NaN

  if (Number.isFinite(parsed) && parsed >= 5000) {
    return parsed
  }

  return PROJECT_DEPLOYMENT_DEFAULT_STALE_AFTER_MS
}

function resolveProjectDeploymentLeaseExpiresAt(timestamp: string) {
  const expiresAt = new Date(Date.parse(timestamp) + projectDeploymentStaleAfterMs())
  return expiresAt.toISOString()
}

function resolveProjectDeploymentWorkerId(workerId?: string) {
  return workerId?.trim() || PROJECT_DEPLOYMENT_DEFAULT_WORKER_ID
}

function buildProjectDeploymentExecutorMetadata(
  metadata: Record<string, unknown>,
  patch: Record<string, unknown>
) {
  return {
    ...asRecord(metadata.executor),
    ...patch,
  }
}

function buildProjectDeploymentHeartbeatMetadata({
  metadata,
  workerId,
}: {
  metadata: Record<string, unknown>
  workerId?: string
}) {
  const heartbeatAt = new Date().toISOString()
  const effectiveWorkerId = resolveProjectDeploymentWorkerId(workerId)

  return {
    metadataPatch: {
      executor: buildProjectDeploymentExecutorMetadata(metadata, {
        heartbeat_at: heartbeatAt,
        lease_expires_at: resolveProjectDeploymentLeaseExpiresAt(heartbeatAt),
        processor: PROJECT_DEPLOYMENT_DEFAULT_WORKER_ID,
        worker_id: effectiveWorkerId,
      }),
    },
    workerId: effectiveWorkerId,
  }
}

function normalizeProjectDeploymentTargetUrl(targetUrl: string) {
  const trimmed = targetUrl.trim()

  if (!trimmed) {
    throw new Error('Deployment target URL is required')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Deployment target URL is invalid')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Deployment target URL must use http or https')
  }

  return parsed.toString()
}

function isSuccessfulProjectDeploymentProbeStatus(status: number) {
  return (status >= 200 && status < 400) || status === 401
}

async function probeProjectDeploymentTarget(
  targetUrl: string
): Promise<ProjectDeploymentHealthCheck> {
  const checkedAt = new Date().toISOString()
  const startedAt = Date.now()
  const normalizedTargetUrl = normalizeProjectDeploymentTargetUrl(targetUrl)
  const timeoutMs = projectDeploymentProbeTimeoutMs()
  const methods: Array<'HEAD' | 'GET'> = ['HEAD', 'GET']
  let lastFailure: ProjectDeploymentHealthCheck | null = null

  for (const method of methods) {
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(timeoutMs)
          : undefined
      const response = await fetch(normalizedTargetUrl, {
        method,
        cache: 'no-store',
        redirect: 'follow',
        signal,
      })

      const health: ProjectDeploymentHealthCheck = {
        checked_at: checkedAt,
        duration_ms: Date.now() - startedAt,
        error: isSuccessfulProjectDeploymentProbeStatus(response.status)
          ? null
          : `upstream responded ${response.status}`,
        final_url: response.url || normalizedTargetUrl,
        method,
        ok: isSuccessfulProjectDeploymentProbeStatus(response.status),
        status_code: response.status,
      }

      if (health.ok) {
        return health
      }

      lastFailure = health
    } catch (error) {
      lastFailure = {
        checked_at: checkedAt,
        duration_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'request failed',
        final_url: normalizedTargetUrl,
        method,
        ok: false,
        status_code: null,
      }
    }
  }

  return (
    lastFailure ?? {
      checked_at: checkedAt,
      duration_ms: Date.now() - startedAt,
      error: 'request failed',
      final_url: normalizedTargetUrl,
      method: 'GET',
      ok: false,
      status_code: null,
    }
  )
}

function resolveProjectDeploymentTimestamps({
  currentCompletedAt,
  nextStatus,
}: {
  currentCompletedAt: string | null
  nextStatus: ProjectDeploymentStatus
}) {
  if (TERMINAL_PROJECT_DEPLOYMENT_STATUSES.includes(nextStatus)) {
    return {
      completed_at: new Date().toISOString(),
    }
  }

  return {
    completed_at: currentCompletedAt,
  }
}

function isInFlightProjectDeployment(status: ProjectDeploymentStatus) {
  return status === 'requested' || status === 'building'
}

async function claimNextRequestedProjectDeployment({
  workerId,
}: {
  workerId?: string
} = {}): Promise<ProjectDeployment | null> {
  await ensureSaasTables()
  const effectiveWorkerId = resolveProjectDeploymentWorkerId(workerId)

  for (let attempt = 0; attempt < PROJECT_DEPLOYMENT_EXECUTOR_MAX_CLAIM_ATTEMPTS; attempt += 1) {
    const candidateResult = await executeQuery<ProjectDeploymentRow>({
      query: `
        select
          id::text as id,
          project_ref,
          requested_by_gotrue_id::text as requested_by_gotrue_id,
          requested_via,
          status,
          target_url,
          custom_domain_hostname,
          logs,
          metadata,
          inserted_at::text as inserted_at,
          updated_at::text as updated_at,
          completed_at::text as completed_at,
          last_error
        from saas.project_deployments
        where status = 'requested'
        order by inserted_at asc
        limit 1
      `,
    })
    if (candidateResult.error) throw candidateResult.error
    if (!candidateResult.data?.length) {
      return null
    }

    const candidate = mapDeploymentRow(candidateResult.data[0])
    const claimedAt = new Date().toISOString()
    const leaseExpiresAt = resolveProjectDeploymentLeaseExpiresAt(claimedAt)
    const nextLogs = appendProjectDeploymentLogs(
      candidate.logs,
      buildProjectDeploymentLog({
        message: 'Deployment claimed by runtime executor',
        source: 'runtime',
      })
    )
    const nextMetadata = {
      ...candidate.metadata,
      deployment_health: null,
      executor: buildProjectDeploymentExecutorMetadata(candidate.metadata, {
        attempt_count: asPositiveInteger(asRecord(candidate.metadata.executor).attempt_count) + 1,
        claimed_at: claimedAt,
        heartbeat_at: claimedAt,
        last_attempted_at: claimedAt,
        lease_expires_at: leaseExpiresAt,
        processor: PROJECT_DEPLOYMENT_DEFAULT_WORKER_ID,
        worker_id: effectiveWorkerId,
      }),
    }

    const claimResult = await executeQuery<ProjectDeploymentRow>({
      query: `
        update saas.project_deployments
        set
          status = 'building',
          logs = $2::jsonb,
          metadata = $3::jsonb,
          updated_at = now(),
          completed_at = null,
          last_error = null
        where id = $1::uuid and status = 'requested'
        returning
          id::text as id,
          project_ref,
          requested_by_gotrue_id::text as requested_by_gotrue_id,
          requested_via,
          status,
          target_url,
          custom_domain_hostname,
          logs,
          metadata,
          inserted_at::text as inserted_at,
          updated_at::text as updated_at,
          completed_at::text as completed_at,
          last_error
      `,
      parameters: [candidate.id, JSON.stringify(nextLogs), JSON.stringify(nextMetadata)],
    })
    if (claimResult.error) throw claimResult.error
    if (claimResult.data?.length) {
      return mapDeploymentRow(claimResult.data[0])
    }
  }

  throw new Error('Failed to claim a queued deployment')
}

async function recoverNextStaleBuildingProjectDeployment({
  workerId,
}: {
  workerId?: string
} = {}): Promise<ProjectDeployment | null> {
  await ensureSaasTables()

  const nowIso = new Date().toISOString()
  const cutoff = new Date(Date.now() - projectDeploymentStaleAfterMs()).toISOString()
  const effectiveWorkerId = resolveProjectDeploymentWorkerId(workerId)

  for (let attempt = 0; attempt < PROJECT_DEPLOYMENT_EXECUTOR_MAX_CLAIM_ATTEMPTS; attempt += 1) {
    const candidateResult = await executeQuery<ProjectDeploymentRow>({
      query: `
        select
          id::text as id,
          project_ref,
          requested_by_gotrue_id::text as requested_by_gotrue_id,
          requested_via,
          status,
          target_url,
          custom_domain_hostname,
          logs,
          metadata,
          inserted_at::text as inserted_at,
          updated_at::text as updated_at,
          completed_at::text as completed_at,
          last_error
        from saas.project_deployments
        where
          status = 'building'
          and (
            nullif(metadata->'executor'->>'lease_expires_at', '')::timestamptz <= $1::timestamptz
            or (
              nullif(metadata->'executor'->>'lease_expires_at', '') is null
              and coalesce(
                nullif(metadata->'executor'->>'heartbeat_at', '')::timestamptz,
                nullif(metadata->'executor'->>'last_attempted_at', '')::timestamptz,
                updated_at
              ) <= $2::timestamptz
            )
          )
        order by updated_at asc
        limit 1
      `,
      parameters: [nowIso, cutoff],
    })
    if (candidateResult.error) throw candidateResult.error
    if (!candidateResult.data?.length) {
      return null
    }

    const candidate = mapDeploymentRow(candidateResult.data[0])
    const recoveredAt = new Date().toISOString()
    const timeoutMinutes = Math.round(projectDeploymentStaleAfterMs() / 60000)
    const staleMessage = `Recovered stale deployment after ${timeoutMinutes} minute timeout`
    const nextLogs = appendProjectDeploymentLogs(
      candidate.logs,
      buildProjectDeploymentLog({
        level: 'error',
        message: staleMessage,
        source: 'runtime',
      })
    )
    const nextMetadata = {
      ...candidate.metadata,
      executor: buildProjectDeploymentExecutorMetadata(candidate.metadata, {
        attempt_error_count:
          asPositiveInteger(asRecord(candidate.metadata.executor).attempt_error_count) + 1,
        heartbeat_at: recoveredAt,
        last_error_at: recoveredAt,
        lease_expires_at: null,
        processor: PROJECT_DEPLOYMENT_DEFAULT_WORKER_ID,
        recovery_count: asPositiveInteger(asRecord(candidate.metadata.executor).recovery_count) + 1,
        recovery_reason: 'stale_build_timeout',
        stale_recovered_at: recoveredAt,
        worker_id: effectiveWorkerId,
      }),
    }

    const recoverResult = await executeQuery<ProjectDeploymentRow>({
      query: `
        update saas.project_deployments
        set
          status = 'failed',
          logs = $2::jsonb,
          metadata = $3::jsonb,
          updated_at = now(),
          completed_at = $4::timestamptz,
          last_error = $5
        where id = $1::uuid and status = 'building'
        returning
          id::text as id,
          project_ref,
          requested_by_gotrue_id::text as requested_by_gotrue_id,
          requested_via,
          status,
          target_url,
          custom_domain_hostname,
          logs,
          metadata,
          inserted_at::text as inserted_at,
          updated_at::text as updated_at,
          completed_at::text as completed_at,
          last_error
      `,
      parameters: [
        candidate.id,
        JSON.stringify(nextLogs),
        JSON.stringify(nextMetadata),
        recoveredAt,
        staleMessage,
      ],
    })
    if (recoverResult.error) throw recoverResult.error
    if (recoverResult.data?.length) {
      const deployment = mapDeploymentRow(recoverResult.data[0])

      await recordAuditLog({
        action: 'project.deployment.updated',
        metadata: {
          deployment_id: deployment.id,
          in_flight: false,
          log_message: staleMessage,
          source: 'runtime',
          status: deployment.status,
        },
        projectRef: deployment.project_ref,
        targetDescription: deployment.id,
        targetType: 'deployment',
      })

      return deployment
    }
  }

  throw new Error('Failed to recover a stale deployment')
}

export function resolveProjectDeploymentRuntimeSecret() {
  const dedicatedSecret = process.env.PROJECT_DEPLOYMENT_RUNTIME_SECRET?.trim()

  if (dedicatedSecret) {
    if (dedicatedSecret.length < 32) {
      throw new Error('Missing/invalid project deployment runtime secret (must be >= 32 chars)')
    }

    return dedicatedSecret
  }

  return resolveBuilderHandoffSecret()
}

function getProjectDeploymentRuntimeTokenFromHeaders(
  headers?: Record<string, string | string[] | undefined>,
) {
  const raw = headers?.['x-indobase-deployment-token']
  return Array.isArray(raw) ? raw[0] : raw
}

export function hasValidProjectDeploymentRuntimeToken(
  headers?: Record<string, string | string[] | undefined>,
) {
  const provided = getProjectDeploymentRuntimeTokenFromHeaders(headers)?.trim()

  if (!provided) {
    return false
  }

  return provided === resolveProjectDeploymentRuntimeSecret()
}

export async function listProjectDeployments({
  claims,
  limit = 20,
  ref,
}: {
  claims: Claims
  limit?: number
  ref: string
}): Promise<ProjectDeployment[]> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const result = await executeQuery<ProjectDeploymentRow>({
    query: `
      select
        d.id::text as id,
        d.project_ref,
        d.requested_by_gotrue_id::text as requested_by_gotrue_id,
        d.requested_via,
        d.status,
        d.target_url,
        d.custom_domain_hostname,
        d.logs,
        d.metadata,
        d.inserted_at::text as inserted_at,
        d.updated_at::text as updated_at,
        d.completed_at::text as completed_at,
        d.last_error
      from saas.project_deployments d
      join saas.projects p on p.ref = d.project_ref
      join saas.organization_members m on m.organization_id = p.organization_id
      where d.project_ref = $1 and m.gotrue_id = $2
      order by d.inserted_at desc
      limit $3
    `,
    parameters: [ref, gotrueId, Math.min(Math.max(limit, 1), 100)],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
  return (result.data ?? []).map(mapDeploymentRow)
}

export async function getProjectDeployment({
  claims,
  deploymentId,
  ref,
}: {
  claims: Claims
  deploymentId: string
  ref: string
}): Promise<ProjectDeployment | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const result = await executeQuery<ProjectDeploymentRow>({
    query: `
      select
        d.id::text as id,
        d.project_ref,
        d.requested_by_gotrue_id::text as requested_by_gotrue_id,
        d.requested_via,
        d.status,
        d.target_url,
        d.custom_domain_hostname,
        d.logs,
        d.metadata,
        d.inserted_at::text as inserted_at,
        d.updated_at::text as updated_at,
        d.completed_at::text as completed_at,
        d.last_error
      from saas.project_deployments d
      join saas.projects p on p.ref = d.project_ref
      join saas.organization_members m on m.organization_id = p.organization_id
      where d.project_ref = $1 and d.id = $2::uuid and m.gotrue_id = $3
      limit 1
    `,
    parameters: [ref, deploymentId, gotrueId],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
  if (!result.data?.length) return null
  return mapDeploymentRow(result.data[0])
}

export async function createProjectDeployment({
  claims,
  metadata,
  ref,
  requestedVia = 'studio',
  skipInlineProcessing = false,
}: {
  claims: Claims
  metadata?: Record<string, unknown>
  ref: string
  requestedVia?: ProjectDeploymentRequestedVia
  /** Builder sync publish uploads artifacts immediately; skip health probe until files exist. */
  skipInlineProcessing?: boolean
}): Promise<ProjectDeployment> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const hosting = await getProjectHostingForRef({ claims, ref })

  if (!hosting) {
    throw new Error('Project not found')
  }

  const existingDeploymentResult = await executeQuery<{ id: string; status: ProjectDeploymentStatus }>({
    query: `
      select id::text as id, status
      from saas.project_deployments
      where project_ref = $1 and status in ('requested', 'building')
      order by inserted_at desc
      limit 1
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (existingDeploymentResult.error) throw existingDeploymentResult.error
  if (existingDeploymentResult.data?.length) {
    throw new Error('An active deployment is already in progress for this project')
  }

  const initialLog = buildProjectDeploymentLog({
    message: `Deployment requested via ${requestedVia}`,
    source: requestedVia === 'builder' ? 'builder' : requestedVia === 'api' ? 'api' : 'studio',
  })

  const result = await executeQuery<ProjectDeploymentRow>({
    query: `
      insert into saas.project_deployments (
        project_ref,
        requested_by_gotrue_id,
        requested_via,
        status,
        target_url,
        custom_domain_hostname,
        logs,
        metadata
      ) values ($1, $2::uuid, $3, 'requested', $4, $5, $6::jsonb, $7::jsonb)
      returning
        id::text as id,
        project_ref,
        requested_by_gotrue_id::text as requested_by_gotrue_id,
        requested_via,
        status,
        target_url,
        custom_domain_hostname,
        logs,
        metadata,
        inserted_at::text as inserted_at,
        updated_at::text as updated_at,
        completed_at::text as completed_at,
        last_error
    `,
    parameters: [
      ref,
      gotrueId,
      requestedVia,
      hosting.hosting.active_url,
      hosting.hosting.custom_domain.hostname,
      JSON.stringify([initialLog]),
      JSON.stringify(metadata ?? {}),
    ],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
  if (!result.data?.length) {
    throw new Error('Failed to create deployment request')
  }

  const deployment = mapDeploymentRow(result.data[0])

  await recordAuditLog({
    action: 'project.deployment.requested',
    claims,
    metadata: {
      deployment_id: deployment.id,
      requested_via: requestedVia,
      status: deployment.status,
      target_url: deployment.target_url,
    },
    projectRef: ref,
    targetDescription: deployment.id,
    targetType: 'deployment',
  })

  if (!skipInlineProcessing && deployment.status === 'requested') {
    try {
      await processProjectDeploymentBatch({ limit: 1, workerId: 'studio_inline' })
      const refreshed = await getProjectDeployment({
        claims,
        deploymentId: deployment.id,
        ref,
      })
      if (refreshed) return refreshed
    } catch (error) {
      console.warn('[deployments] inline process failed:', error)
    }
  }

  return deployment
}

export async function updateProjectDeployment({
  deploymentId,
  lastError,
  logLevel,
  logMessage,
  metadataPatch,
  ref,
  source,
  status,
  targetUrl,
}: {
  deploymentId: string
  lastError?: string | null
  logLevel?: ProjectDeploymentLogLevel
  logMessage?: string
  metadataPatch?: Record<string, unknown>
  ref: string
  source: ProjectDeploymentLogSource
  status?: ProjectDeploymentStatus
  targetUrl?: string
}): Promise<ProjectDeployment> {
  await ensureSaasTables()
  const existingResult = await executeQuery<ProjectDeploymentRow>({
    query: `
      select
        d.id::text as id,
        d.project_ref,
        d.requested_by_gotrue_id::text as requested_by_gotrue_id,
        d.requested_via,
        d.status,
        d.target_url,
        d.custom_domain_hostname,
        d.logs,
        d.metadata,
        d.inserted_at::text as inserted_at,
        d.updated_at::text as updated_at,
        d.completed_at::text as completed_at,
        d.last_error
      from saas.project_deployments d
      where d.project_ref = $1 and d.id = $2::uuid
      limit 1
    `,
    parameters: [ref, deploymentId],
  })
  if (existingResult.error) throw existingResult.error
  if (!existingResult.data?.length) {
    throw new Error('Deployment not found')
  }

  const current = mapDeploymentRow(existingResult.data[0])
  const nextStatus = status ?? current.status
  assertValidProjectDeploymentTransition(current.status, nextStatus)

  const nextLog =
    logMessage?.trim() || current.status !== nextStatus
      ? buildProjectDeploymentLog({
          level: logLevel ?? (nextStatus === 'failed' ? 'error' : 'info'),
          message:
            logMessage?.trim() ||
            `Deployment status changed from ${current.status} to ${nextStatus}`,
          source,
        })
      : undefined

  const nextLogs = appendProjectDeploymentLogs(current.logs, nextLog)
  const timestamps = resolveProjectDeploymentTimestamps({
    currentCompletedAt: current.completed_at,
    nextStatus,
  })
  const nextLastError =
    nextStatus === 'failed'
      ? lastError?.trim() || current.last_error || 'Deployment failed'
      : nextStatus === 'ready'
        ? null
        : lastError === undefined
          ? current.last_error
          : lastError
  const nextMetadata = {
    ...current.metadata,
    ...(metadataPatch ?? {}),
  }
  const nextTargetUrl = targetUrl?.trim()
    ? normalizeProjectDeploymentTargetUrl(targetUrl)
    : current.target_url

  const updateResult = await executeQuery<ProjectDeploymentRow>({
    query: `
      update saas.project_deployments
      set
        status = $3,
        logs = $4::jsonb,
        metadata = $5::jsonb,
        target_url = $8,
        updated_at = now(),
        completed_at = $6::timestamptz,
        last_error = $7
      where project_ref = $1 and id = $2::uuid
      returning
        id::text as id,
        project_ref,
        requested_by_gotrue_id::text as requested_by_gotrue_id,
        requested_via,
        status,
        target_url,
        custom_domain_hostname,
        logs,
        metadata,
        inserted_at::text as inserted_at,
        updated_at::text as updated_at,
        completed_at::text as completed_at,
        last_error
    `,
    parameters: [
      ref,
      deploymentId,
      nextStatus,
      JSON.stringify(nextLogs),
      JSON.stringify(nextMetadata),
      timestamps.completed_at,
      nextLastError,
      nextTargetUrl,
    ],
  })
  if (updateResult.error) throw updateResult.error
  if (!updateResult.data?.length) {
    throw new Error('Failed to update deployment')
  }

  const deployment = mapDeploymentRow(updateResult.data[0])

  await recordAuditLog({
    action: 'project.deployment.updated',
    metadata: {
      deployment_id: deployment.id,
      in_flight: isInFlightProjectDeployment(deployment.status),
      log_message: nextLog?.message ?? null,
      source,
      status: deployment.status,
    },
    projectRef: ref,
    targetDescription: deployment.id,
    targetType: 'deployment',
  })

  return deployment
}

export async function renewProjectDeploymentHeartbeat({
  deploymentId,
  logLevel,
  logMessage,
  metadataPatch,
  ref,
  source = 'runtime',
  workerId,
}: {
  deploymentId: string
  logLevel?: ProjectDeploymentLogLevel
  logMessage?: string
  metadataPatch?: Record<string, unknown>
  ref: string
  source?: ProjectDeploymentLogSource
  workerId?: string
}): Promise<ProjectDeployment> {
  await ensureSaasTables()

  const existingResult = await executeQuery<ProjectDeploymentRow>({
    query: `
      select
        d.id::text as id,
        d.project_ref,
        d.requested_by_gotrue_id::text as requested_by_gotrue_id,
        d.requested_via,
        d.status,
        d.target_url,
        d.custom_domain_hostname,
        d.logs,
        d.metadata,
        d.inserted_at::text as inserted_at,
        d.updated_at::text as updated_at,
        d.completed_at::text as completed_at,
        d.last_error
      from saas.project_deployments d
      where d.project_ref = $1 and d.id = $2::uuid
      limit 1
    `,
    parameters: [ref, deploymentId],
  })
  if (existingResult.error) throw existingResult.error
  if (!existingResult.data?.length) {
    throw new Error('Deployment not found')
  }

  const current = mapDeploymentRow(existingResult.data[0])
  if (current.status !== 'building') {
    throw new Error('Deployment heartbeat can only renew building deployments')
  }

  const currentWorkerId = asRecord(current.metadata.executor).worker_id
  const effectiveWorkerId = resolveProjectDeploymentWorkerId(workerId)
  if (
    typeof currentWorkerId === 'string' &&
    currentWorkerId.trim() &&
    currentWorkerId.trim() !== effectiveWorkerId
  ) {
    throw new Error('Deployment heartbeat worker does not match the active lease owner')
  }

  const heartbeat = buildProjectDeploymentHeartbeatMetadata({
    metadata: current.metadata,
    workerId: effectiveWorkerId,
  })

  return updateProjectDeployment({
    deploymentId,
    logLevel,
    logMessage,
    metadataPatch: {
      ...(metadataPatch ?? {}),
      ...heartbeat.metadataPatch,
    },
    ref,
    source,
    status: 'building',
  })
}

export async function processNextProjectDeployment({
  workerId,
}: {
  workerId?: string
} = {}): Promise<ProcessProjectDeploymentResult> {
  const effectiveWorkerId = resolveProjectDeploymentWorkerId(workerId)
  const recoveredDeployment = await recoverNextStaleBuildingProjectDeployment({
    workerId: effectiveWorkerId,
  })

  if (recoveredDeployment) {
    return {
      deployment: recoveredDeployment,
      health: null,
      outcome: 'failed',
    }
  }

  const claimedDeployment = await claimNextRequestedProjectDeployment({
    workerId: effectiveWorkerId,
  })

  if (!claimedDeployment) {
    return {
      deployment: null,
      health: null,
      outcome: 'idle',
    }
  }

  let health: ProjectDeploymentHealthCheck | null = null

  try {
    health = await probeProjectDeploymentTarget(claimedDeployment.target_url)

    const nextStatus: ProjectDeploymentStatus = health.ok ? 'ready' : 'failed'
    const statusMessage = health.ok
      ? `Deployment verified at ${health.final_url ?? claimedDeployment.target_url}`
      : `Deployment health check failed: ${health.error ?? 'unknown error'}`

    const deployment = await updateProjectDeployment({
      deploymentId: claimedDeployment.id,
      lastError: health.ok ? null : health.error,
      logLevel: health.ok ? 'info' : 'error',
      logMessage: statusMessage,
      metadataPatch: {
        deployment_health: health,
        executor: buildProjectDeploymentExecutorMetadata(claimedDeployment.metadata, {
          finished_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          last_succeeded_at: new Date().toISOString(),
          lease_expires_at: null,
          processor: PROJECT_DEPLOYMENT_DEFAULT_WORKER_ID,
          worker_id: effectiveWorkerId,
        }),
      },
      ref: claimedDeployment.project_ref,
      source: 'runtime',
      status: nextStatus,
    })

    return {
      deployment,
      health,
      outcome: health.ok ? 'ready' : 'failed',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deployment processing failed'
    const failureHealth =
      health ??
      ({
        checked_at: new Date().toISOString(),
        duration_ms: 0,
        error: message,
        final_url: claimedDeployment.target_url,
        method: 'GET',
        ok: false,
        status_code: null,
      } satisfies ProjectDeploymentHealthCheck)

    const deployment = await updateProjectDeployment({
      deploymentId: claimedDeployment.id,
      lastError: message,
      logLevel: 'error',
      logMessage: `Deployment executor failed: ${message}`,
      metadataPatch: {
        deployment_health: failureHealth,
        executor: buildProjectDeploymentExecutorMetadata(claimedDeployment.metadata, {
          attempt_error_count:
            asPositiveInteger(asRecord(claimedDeployment.metadata.executor).attempt_error_count) + 1,
          failed_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          last_error_at: new Date().toISOString(),
          lease_expires_at: null,
          processor: PROJECT_DEPLOYMENT_DEFAULT_WORKER_ID,
          worker_id: effectiveWorkerId,
        }),
      },
      ref: claimedDeployment.project_ref,
      source: 'runtime',
      status: 'failed',
    })

    return {
      deployment,
      health: failureHealth,
      outcome: 'failed',
    }
  }
}

export async function processProjectDeploymentBatch({
  limit = 1,
  workerId,
}: {
  limit?: number
  workerId?: string
} = {}): Promise<ProcessProjectDeploymentBatchResult> {
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 20)
  const results: ProcessProjectDeploymentResult[] = []
  let ready = 0
  let failed = 0

  for (let index = 0; index < normalizedLimit; index += 1) {
    const result = await processNextProjectDeployment({ workerId })
    results.push(result)

    if (result.outcome === 'idle') {
      break
    }

    if (result.outcome === 'ready') {
      ready += 1
    } else if (result.outcome === 'failed') {
      failed += 1
    }
  }

  return {
    failed,
    idle: results.length === 0 || results[results.length - 1]?.outcome === 'idle',
    processed: ready + failed,
    ready,
    results,
  }
}
