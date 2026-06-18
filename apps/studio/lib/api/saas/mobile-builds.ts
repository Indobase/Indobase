import type { JwtPayload } from '@indobaseinc/indobase-js'

import { recordAuditLog, type AuditAction, type AuditTargetType } from './audit'
import { resolveBuilderHandoffSecret } from './builder-launch'
import { ensureSaasTables, getGotrueUserId } from './platform'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, unknown>

const PROJECT_MOBILE_BUILD_REQUESTED_AUDIT_ACTION =
  'project.mobile_build.requested' as AuditAction
const PROJECT_MOBILE_BUILD_UPDATED_AUDIT_ACTION =
  'project.mobile_build.updated' as AuditAction
const PROJECT_MOBILE_BUILD_AUDIT_TARGET_TYPE = 'build' as AuditTargetType

export type ProjectMobileBuildStatus = 'requested' | 'building' | 'ready' | 'failed' | 'archived'
export type ProjectMobileBuildRequestedVia = 'studio' | 'builder' | 'api'
export type ProjectMobileBuildLogLevel = 'info' | 'warning' | 'error'
export type ProjectMobileBuildLogSource = 'api' | 'builder' | 'runtime' | 'studio'
export type ProjectMobileBuildTarget = 'android_aab'
export type ProjectMobileBuildFramework = 'expo' | 'react_native' | 'flutter' | 'other'
export type ProjectMobileBuildProfile = 'production' | 'preview'
export type ProjectMobileBuildArtifactKind = 'android_aab' | 'mapping' | 'manifest' | 'other'
export type ProjectMobileBuildPriority = 'standard' | 'priority'

type PlanId = 'free' | 'pro' | 'team' | 'enterprise' | 'platform'

export type ProjectMobileBuildLog = {
  level: ProjectMobileBuildLogLevel
  message: string
  source: ProjectMobileBuildLogSource
  timestamp: string
}

export type ProjectMobileBuildArtifact = {
  build_id: string
  checksum_sha256: string | null
  download_url: string
  file_name: string
  id: string
  inserted_at: string
  kind: ProjectMobileBuildArtifactKind
  metadata: Record<string, unknown>
  mime_type: string | null
  size_bytes: number | null
  updated_at: string
}

export type ProjectMobileBuild = {
  artifacts: ProjectMobileBuildArtifact[]
  completed_at: string | null
  framework: ProjectMobileBuildFramework
  id: string
  inserted_at: string
  last_error: string | null
  logs: ProjectMobileBuildLog[]
  metadata: Record<string, unknown>
  priority: ProjectMobileBuildPriority
  profile: ProjectMobileBuildProfile
  project_ref: string
  requested_by_gotrue_id: string
  requested_via: ProjectMobileBuildRequestedVia
  status: ProjectMobileBuildStatus
  target: ProjectMobileBuildTarget
  updated_at: string
}

type ProjectMobileBuildRow = {
  completed_at: string | null
  framework: ProjectMobileBuildFramework
  id: string
  inserted_at: string
  last_error: string | null
  logs: ProjectMobileBuildLog[] | null
  metadata: Record<string, unknown> | null
  priority: ProjectMobileBuildPriority
  profile: ProjectMobileBuildProfile
  project_ref: string
  requested_by_gotrue_id: string
  requested_via: ProjectMobileBuildRequestedVia
  status: ProjectMobileBuildStatus
  target: ProjectMobileBuildTarget
  updated_at: string
}

type ProjectMobileBuildArtifactRow = {
  build_id: string
  checksum_sha256: string | null
  download_url: string
  file_name: string
  id: string
  inserted_at: string
  kind: ProjectMobileBuildArtifactKind
  metadata: Record<string, unknown> | null
  mime_type: string | null
  size_bytes: string | number | null
  updated_at: string
}

export type CreateProjectMobileBuildArtifact = {
  checksum_sha256?: string | null
  download_url: string
  file_name: string
  kind?: ProjectMobileBuildArtifactKind
  metadata?: Record<string, unknown>
  mime_type?: string | null
  size_bytes?: number | null
}

export type ProcessProjectMobileBuildResult = {
  build: ProjectMobileBuild | null
  outcome: 'claimed' | 'failed' | 'idle'
}

export type ProcessProjectMobileBuildBatchResult = {
  claimed: number
  failed: number
  idle: boolean
  processed: number
  results: ProcessProjectMobileBuildResult[]
}

type ProjectMobileBuildQueueCandidateRow = ProjectMobileBuildRow & {
  organization_id: number
  organization_plan: PlanId | string
}

type ProjectMobileBuildProjectContext = {
  organization_id: number
  organization_plan: PlanId
  project_id: string
}

function mapProjectMobileBuildRow(row: ProjectMobileBuildRow): ProjectMobileBuild {
  return {
    artifacts: [],
    completed_at: row.completed_at,
    framework: row.framework,
    id: row.id,
    inserted_at: row.inserted_at,
    last_error: row.last_error,
    logs: row.logs ?? [],
    metadata: row.metadata ?? {},
    priority: row.priority,
    profile: row.profile,
    project_ref: row.project_ref,
    requested_by_gotrue_id: row.requested_by_gotrue_id,
    requested_via: row.requested_via,
    status: row.status,
    target: row.target,
    updated_at: row.updated_at,
  }
}

function mapProjectMobileBuildArtifactRow(
  row: ProjectMobileBuildArtifactRow
): ProjectMobileBuildArtifact {
  const sizeBytes =
    typeof row.size_bytes === 'number'
      ? row.size_bytes
      : typeof row.size_bytes === 'string'
        ? parseInt(row.size_bytes, 10)
        : null

  return {
    build_id: row.build_id,
    checksum_sha256: row.checksum_sha256,
    download_url: row.download_url,
    file_name: row.file_name,
    id: row.id,
    inserted_at: row.inserted_at,
    kind: row.kind,
    metadata: row.metadata ?? {},
    mime_type: row.mime_type,
    size_bytes: Number.isFinite(sizeBytes ?? NaN) ? sizeBytes : null,
    updated_at: row.updated_at,
  }
}

const TERMINAL_PROJECT_MOBILE_BUILD_STATUSES: ProjectMobileBuildStatus[] = [
  'archived',
  'failed',
  'ready',
]
const PROJECT_MOBILE_BUILD_EXECUTOR_MAX_CLAIM_ATTEMPTS = 5
const PROJECT_MOBILE_BUILD_DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000
const PROJECT_MOBILE_BUILD_DEFAULT_WORKER_ID = 'studio_mobile_build_executor'
const PROJECT_MOBILE_BUILD_DEFAULT_ORG_CONCURRENT_LIMITS: Record<PlanId, number> = {
  enterprise: 25,
  free: 1,
  platform: 50,
  pro: 3,
  team: 10,
}
const PROJECT_MOBILE_BUILD_DEFAULT_ORG_OUTSTANDING_LIMITS: Record<PlanId, number> = {
  enterprise: 100,
  free: 3,
  platform: 200,
  pro: 10,
  team: 25,
}
const PROJECT_MOBILE_BUILD_DEFAULT_PRIORITIES: Record<PlanId, ProjectMobileBuildPriority> = {
  enterprise: 'priority',
  free: 'standard',
  platform: 'priority',
  pro: 'standard',
  team: 'priority',
}
const PROJECT_MOBILE_BUILD_TRANSITIONS: Record<
  ProjectMobileBuildStatus,
  ProjectMobileBuildStatus[]
> = {
  archived: [],
  building: ['ready', 'failed', 'archived'],
  failed: ['archived'],
  ready: ['archived'],
  requested: ['building', 'failed', 'archived'],
}

export function isValidProjectMobileBuildTransition(
  currentStatus: ProjectMobileBuildStatus,
  nextStatus: ProjectMobileBuildStatus
) {
  if (currentStatus === nextStatus) {
    return true
  }

  return PROJECT_MOBILE_BUILD_TRANSITIONS[currentStatus].includes(nextStatus)
}

function assertValidProjectMobileBuildTransition(
  currentStatus: ProjectMobileBuildStatus,
  nextStatus: ProjectMobileBuildStatus
) {
  if (!isValidProjectMobileBuildTransition(currentStatus, nextStatus)) {
    throw new Error(`Invalid mobile build status transition: ${currentStatus} -> ${nextStatus}`)
  }
}

function buildProjectMobileBuildLog({
  level = 'info',
  message,
  source,
}: {
  level?: ProjectMobileBuildLogLevel
  message: string
  source: ProjectMobileBuildLogSource
}): ProjectMobileBuildLog {
  const cleanMessage = message.trim()

  if (!cleanMessage) {
    throw new Error('Mobile build log message is required')
  }

  return {
    level,
    message: cleanMessage,
    source,
    timestamp: new Date().toISOString(),
  }
}

function appendProjectMobileBuildLogs(
  existingLogs: ProjectMobileBuildLog[] | null | undefined,
  nextLog?: ProjectMobileBuildLog
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

function normalizePlanId(plan?: string): PlanId {
  const normalizedPlan = (plan ?? '').trim().toLowerCase()

  switch (normalizedPlan) {
    case 'pro':
    case 'team':
    case 'enterprise':
    case 'platform':
      return normalizedPlan as PlanId
    case 'free':
    default:
      return 'free'
  }
}

function asPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0
}

function readPositiveIntegerEnv(key: string, fallback: number) {
  const raw = process.env[key]?.trim()
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function resolveProjectMobileBuildOrgConcurrentLimit(plan: string) {
  const normalizedPlan = normalizePlanId(plan)
  return readPositiveIntegerEnv(
    `PROJECT_MOBILE_BUILD_${normalizedPlan.toUpperCase()}_MAX_CONCURRENT_PER_ORG`,
    PROJECT_MOBILE_BUILD_DEFAULT_ORG_CONCURRENT_LIMITS[normalizedPlan]
  )
}

export function resolveProjectMobileBuildOrgOutstandingLimit(plan: string) {
  const normalizedPlan = normalizePlanId(plan)
  return readPositiveIntegerEnv(
    `PROJECT_MOBILE_BUILD_${normalizedPlan.toUpperCase()}_MAX_OUTSTANDING_PER_ORG`,
    PROJECT_MOBILE_BUILD_DEFAULT_ORG_OUTSTANDING_LIMITS[normalizedPlan]
  )
}

export function resolveProjectMobileBuildPriorityForPlan(plan: string): ProjectMobileBuildPriority {
  const normalizedPlan = normalizePlanId(plan)
  const raw = process.env[`PROJECT_MOBILE_BUILD_${normalizedPlan.toUpperCase()}_PRIORITY`]?.trim()

  if (raw === 'priority' || raw === 'standard') {
    return raw
  }

  return PROJECT_MOBILE_BUILD_DEFAULT_PRIORITIES[normalizedPlan]
}

function normalizeProjectMobileBuildTarget(target?: string): ProjectMobileBuildTarget {
  if (!target || target === 'android_aab') {
    return 'android_aab'
  }

  throw new Error('Unsupported mobile build target')
}

function normalizeProjectMobileBuildFramework(framework?: string): ProjectMobileBuildFramework {
  switch (framework) {
    case undefined:
    case '':
    case 'expo':
      return 'expo'
    case 'react_native':
    case 'flutter':
    case 'other':
      return framework
    default:
      throw new Error('Unsupported mobile build framework')
  }
}

function normalizeProjectMobileBuildProfile(profile?: string): ProjectMobileBuildProfile {
  switch (profile) {
    case undefined:
    case '':
    case 'production':
      return 'production'
    case 'preview':
      return 'preview'
    default:
      throw new Error('Unsupported mobile build profile')
  }
}

function normalizeOptionalText(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`)
  }

  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeAndroidPackageName(value: unknown) {
  const packageName = normalizeOptionalText(value, 'Android package name')

  if (!packageName) {
    throw new Error('Android package name is required')
  }

  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(packageName)) {
    throw new Error('Android package name is invalid')
  }

  return packageName
}

function normalizeVersionName(value: unknown) {
  const versionName = normalizeOptionalText(value, 'Version name')
  return versionName ?? '1.0.0'
}

function normalizeVersionCode(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return 1
  }

  const parsed =
    typeof value === 'number'
      ? Math.trunc(value)
      : typeof value === 'string'
        ? parseInt(value, 10)
        : NaN

  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error('Version code must be a positive integer')
  }

  return parsed
}

function projectMobileBuildStaleAfterMs() {
  const raw = process.env.PROJECT_MOBILE_BUILD_STALE_AFTER_MS?.trim()
  const parsed = raw ? parseInt(raw, 10) : NaN

  if (Number.isFinite(parsed) && parsed >= 5000) {
    return parsed
  }

  return PROJECT_MOBILE_BUILD_DEFAULT_STALE_AFTER_MS
}

function resolveProjectMobileBuildLeaseExpiresAt(timestamp: string) {
  const expiresAt = new Date(Date.parse(timestamp) + projectMobileBuildStaleAfterMs())
  return expiresAt.toISOString()
}

function resolveProjectMobileBuildWorkerId(workerId?: string) {
  return workerId?.trim() || PROJECT_MOBILE_BUILD_DEFAULT_WORKER_ID
}

function buildProjectMobileBuildExecutorMetadata(
  metadata: Record<string, unknown>,
  patch: Record<string, unknown>
) {
  return {
    ...asRecord(metadata.executor),
    ...patch,
  }
}

function buildProjectMobileBuildHeartbeatMetadata({
  metadata,
  workerId,
}: {
  metadata: Record<string, unknown>
  workerId?: string
}) {
  const heartbeatAt = new Date().toISOString()
  const effectiveWorkerId = resolveProjectMobileBuildWorkerId(workerId)

  return {
    metadataPatch: {
      executor: buildProjectMobileBuildExecutorMetadata(metadata, {
        heartbeat_at: heartbeatAt,
        lease_expires_at: resolveProjectMobileBuildLeaseExpiresAt(heartbeatAt),
        processor: PROJECT_MOBILE_BUILD_DEFAULT_WORKER_ID,
        worker_id: effectiveWorkerId,
      }),
    },
    workerId: effectiveWorkerId,
  }
}

function normalizeProjectMobileBuildArtifactKind(kind?: string): ProjectMobileBuildArtifactKind {
  switch (kind) {
    case undefined:
    case '':
    case 'android_aab':
      return 'android_aab'
    case 'mapping':
    case 'manifest':
    case 'other':
      return kind
    default:
      throw new Error('Unsupported mobile build artifact kind')
  }
}

function normalizeProjectMobileBuildArtifact(
  artifact: CreateProjectMobileBuildArtifact
): Required<CreateProjectMobileBuildArtifact> {
  const downloadUrl = normalizeOptionalText(artifact.download_url, 'Artifact download URL')
  const fileName = normalizeOptionalText(artifact.file_name, 'Artifact file name')
  const checksum = normalizeOptionalText(artifact.checksum_sha256, 'Artifact checksum')
  const mimeType = normalizeOptionalText(artifact.mime_type, 'Artifact MIME type') ?? null
  const kind = normalizeProjectMobileBuildArtifactKind(artifact.kind)

  if (!downloadUrl) {
    throw new Error('Artifact download URL is required')
  }

  if (!fileName) {
    throw new Error('Artifact file name is required')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(downloadUrl)
  } catch {
    throw new Error('Artifact download URL is invalid')
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('Artifact download URL must use http or https')
  }

  const sizeBytes =
    artifact.size_bytes === undefined || artifact.size_bytes === null
      ? null
      : Math.trunc(artifact.size_bytes)

  if (sizeBytes !== null && (!Number.isFinite(sizeBytes) || sizeBytes < 0)) {
    throw new Error('Artifact size must be a non-negative integer')
  }

  return {
    checksum_sha256: checksum ?? null,
    download_url: parsedUrl.toString(),
    file_name: fileName,
    kind,
    metadata: artifact.metadata ?? {},
    mime_type: mimeType,
    size_bytes: sizeBytes,
  }
}

function normalizeProjectMobileBuildMetadata(
  metadata: Record<string, unknown> | undefined,
  {
    framework,
    projectRef,
  }: {
    framework: ProjectMobileBuildFramework
    projectRef: string
  }
) {
  const nextMetadata = {
    ...(metadata ?? {}),
  }

  const applicationId =
    normalizeOptionalText(nextMetadata.android_package_name, 'Android package name') ??
    `com.indobase.${projectRef.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'app'}`

  return {
    ...nextMetadata,
    android_package_name: normalizeAndroidPackageName(applicationId),
    build_profile: normalizeProjectMobileBuildProfile(String(nextMetadata.build_profile ?? 'production')),
    framework,
    instructions: normalizeOptionalText(nextMetadata.instructions, 'Build instructions') ?? null,
    source_branch: normalizeOptionalText(nextMetadata.source_branch, 'Source branch') ?? 'main',
    source_commit_sha:
      normalizeOptionalText(nextMetadata.source_commit_sha, 'Source commit SHA') ?? null,
    version_code: normalizeVersionCode(nextMetadata.version_code),
    version_name: normalizeVersionName(nextMetadata.version_name),
  }
}

function resolveProjectMobileBuildTimestamps({
  currentCompletedAt,
  nextStatus,
}: {
  currentCompletedAt: string | null
  nextStatus: ProjectMobileBuildStatus
}) {
  if (TERMINAL_PROJECT_MOBILE_BUILD_STATUSES.includes(nextStatus)) {
    return {
      completed_at: new Date().toISOString(),
    }
  }

  return {
    completed_at: currentCompletedAt,
  }
}

function isInFlightProjectMobileBuild(status: ProjectMobileBuildStatus) {
  return status === 'requested' || status === 'building'
}

function isActiveProjectMobileBuildConflict(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''

  return (
    message.includes('project_mobile_builds_one_active_per_project_idx') ||
    message.includes('duplicate key value violates unique constraint')
  )
}

async function getProjectMobileBuildProjectContext({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<ProjectMobileBuildProjectContext | null> {
  const gotrueId = getGotrueUserId(claims)
  const result = await executeQuery<{
    organization_id: number
    organization_plan: string
    project_id: string
  }>({
    query: `
      select
        p.id::text as project_id,
        p.organization_id,
        o.plan as organization_plan
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      join saas.organizations o on o.id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2 and m.role in ('owner', 'admin', 'developer')
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (result.error) throw result.error

  const row = result.data?.[0]
  if (!row) {
    return null
  }

  return {
    organization_id: row.organization_id,
    organization_plan: normalizePlanId(row.organization_plan),
    project_id: row.project_id,
  }
}

async function getProjectMobileBuildOrganizationLoad({
  organizationId,
}: {
  organizationId: number
}) {
  const result = await executeQuery<{
    building_count: string | number
    outstanding_count: string | number
    requested_count: string | number
  }>({
    query: `
      select
        count(*) filter (where b.status = 'building')::text as building_count,
        count(*) filter (where b.status in ('requested', 'building'))::text as outstanding_count,
        count(*) filter (where b.status = 'requested')::text as requested_count
      from saas.project_mobile_builds b
      join saas.projects p on p.ref = b.project_ref
      where p.organization_id = $1
    `,
    parameters: [organizationId],
  })
  if (result.error) throw result.error

  const row = result.data?.[0]

  return {
    building_count:
      typeof row?.building_count === 'number'
        ? row.building_count
        : parseInt(String(row?.building_count ?? '0'), 10) || 0,
    outstanding_count:
      typeof row?.outstanding_count === 'number'
        ? row.outstanding_count
        : parseInt(String(row?.outstanding_count ?? '0'), 10) || 0,
    requested_count:
      typeof row?.requested_count === 'number'
        ? row.requested_count
        : parseInt(String(row?.requested_count ?? '0'), 10) || 0,
  }
}

async function listProjectMobileBuildArtifactsForBuildIds(buildIds: string[]) {
  if (buildIds.length === 0) {
    return new Map<string, ProjectMobileBuildArtifact[]>()
  }

  const result = await executeQuery<ProjectMobileBuildArtifactRow>({
    query: `
      select
        id::text as id,
        build_id::text as build_id,
        kind,
        file_name,
        mime_type,
        size_bytes::text as size_bytes,
        checksum_sha256,
        download_url,
        metadata,
        inserted_at::text as inserted_at,
        updated_at::text as updated_at
      from saas.project_mobile_build_artifacts
      where build_id = any($1::uuid[])
      order by inserted_at desc
    `,
    parameters: [buildIds],
  })
  if (result.error) throw result.error

  const artifactsByBuildId = new Map<string, ProjectMobileBuildArtifact[]>()

  for (const row of result.data ?? []) {
    const artifact = mapProjectMobileBuildArtifactRow(row)
    const artifacts = artifactsByBuildId.get(artifact.build_id) ?? []
    artifacts.push(artifact)
    artifactsByBuildId.set(artifact.build_id, artifacts)
  }

  return artifactsByBuildId
}

async function hydrateProjectMobileBuilds(builds: ProjectMobileBuild[]) {
  const artifactsByBuildId = await listProjectMobileBuildArtifactsForBuildIds(builds.map((build) => build.id))

  return builds.map((build) => ({
    ...build,
    artifacts: artifactsByBuildId.get(build.id) ?? [],
  }))
}

async function getProjectMobileBuildByIdUnchecked({
  buildId,
  ref,
}: {
  buildId: string
  ref: string
}): Promise<ProjectMobileBuild | null> {
  await ensureSaasTables()
  const result = await executeQuery<ProjectMobileBuildRow>({
    query: `
      select
        id::text as id,
        project_ref,
        requested_by_gotrue_id::text as requested_by_gotrue_id,
        requested_via,
        status,
        priority,
        target,
        framework,
        profile,
        logs,
        metadata,
        inserted_at::text as inserted_at,
        updated_at::text as updated_at,
        completed_at::text as completed_at,
        last_error
      from saas.project_mobile_builds
      where project_ref = $1 and id = $2::uuid
      limit 1
    `,
    parameters: [ref, buildId],
  })
  if (result.error) throw result.error
  if (!result.data?.length) return null
  const builds = await hydrateProjectMobileBuilds([mapProjectMobileBuildRow(result.data[0])])
  return builds[0] ?? null
}

async function createProjectMobileBuildArtifactsInternal({
  artifacts,
  buildId,
}: {
  artifacts: CreateProjectMobileBuildArtifact[]
  buildId: string
}) {
  for (const artifact of artifacts) {
    const normalizedArtifact = normalizeProjectMobileBuildArtifact(artifact)
    const result = await executeQuery({
      query: `
        insert into saas.project_mobile_build_artifacts (
          build_id,
          kind,
          file_name,
          mime_type,
          size_bytes,
          checksum_sha256,
          download_url,
          metadata
        ) values ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      parameters: [
        buildId,
        normalizedArtifact.kind,
        normalizedArtifact.file_name,
        normalizedArtifact.mime_type,
        normalizedArtifact.size_bytes,
        normalizedArtifact.checksum_sha256,
        normalizedArtifact.download_url,
        JSON.stringify(normalizedArtifact.metadata),
      ],
    })
    if (result.error) throw result.error
  }
}

async function claimNextRequestedProjectMobileBuild({
  workerId,
}: {
  workerId?: string
} = {}): Promise<ProjectMobileBuild | null> {
  await ensureSaasTables()
  const effectiveWorkerId = resolveProjectMobileBuildWorkerId(workerId)

  for (let attempt = 0; attempt < PROJECT_MOBILE_BUILD_EXECUTOR_MAX_CLAIM_ATTEMPTS; attempt += 1) {
    const candidateResult = await executeQuery<ProjectMobileBuildQueueCandidateRow>({
      query: `
        select
          id::text as id,
          project_ref,
          requested_by_gotrue_id::text as requested_by_gotrue_id,
          requested_via,
          status,
          priority,
          target,
          framework,
          profile,
          logs,
          metadata,
          p.organization_id,
          o.plan as organization_plan,
          inserted_at::text as inserted_at,
          updated_at::text as updated_at,
          completed_at::text as completed_at,
          last_error
        from saas.project_mobile_builds
        join saas.projects p on p.ref = project_ref
        join saas.organizations o on o.id = p.organization_id
        where status = 'requested'
        order by
          case priority when 'priority' then 0 else 1 end asc,
          inserted_at asc
        limit 25
      `,
    })
    if (candidateResult.error) throw candidateResult.error
    if (!candidateResult.data?.length) {
      return null
    }

    for (const candidateRow of candidateResult.data) {
      const candidate = mapProjectMobileBuildRow(candidateRow)
      const organizationPlan = normalizePlanId(candidateRow.organization_plan)
      const orgConcurrentLimit = resolveProjectMobileBuildOrgConcurrentLimit(organizationPlan)
      const claimedAt = new Date().toISOString()
      const leaseExpiresAt = resolveProjectMobileBuildLeaseExpiresAt(claimedAt)
      const nextLogs = appendProjectMobileBuildLogs(
        candidate.logs,
        buildProjectMobileBuildLog({
          message: `Mobile build claimed by runtime executor (${candidate.priority} priority)`,
          source: 'runtime',
        })
      )
      const nextMetadata = {
        ...candidate.metadata,
        organization_plan: organizationPlan,
        priority: candidate.priority,
        queue_limits: {
          org_concurrent_limit: orgConcurrentLimit,
          org_outstanding_limit: resolveProjectMobileBuildOrgOutstandingLimit(organizationPlan),
        },
        executor: buildProjectMobileBuildExecutorMetadata(candidate.metadata, {
          attempt_count: asPositiveInteger(asRecord(candidate.metadata.executor).attempt_count) + 1,
          claimed_at: claimedAt,
          heartbeat_at: claimedAt,
          last_attempted_at: claimedAt,
          lease_expires_at: leaseExpiresAt,
          processor: PROJECT_MOBILE_BUILD_DEFAULT_WORKER_ID,
          worker_id: effectiveWorkerId,
        }),
      }

      const claimResult = await executeQuery<ProjectMobileBuildRow>({
        query: `
          update saas.project_mobile_builds
          set
            status = 'building',
            logs = $2::jsonb,
            metadata = $3::jsonb,
            updated_at = now(),
            completed_at = null,
            last_error = null
          where
            id = $1::uuid
            and status = 'requested'
            and (
              select count(*)
              from saas.project_mobile_builds sibling
              join saas.projects sibling_project on sibling_project.ref = sibling.project_ref
              where sibling_project.organization_id = $4::integer
                and sibling.status = 'building'
            ) < $5
          returning
            id::text as id,
            project_ref,
            requested_by_gotrue_id::text as requested_by_gotrue_id,
            requested_via,
            status,
            priority,
            target,
            framework,
            profile,
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
          candidateRow.organization_id,
          orgConcurrentLimit,
        ],
      })
      if (claimResult.error) throw claimResult.error
      if (claimResult.data?.length) {
        const builds = await hydrateProjectMobileBuilds([mapProjectMobileBuildRow(claimResult.data[0])])
        return builds[0] ?? null
      }
    }
  }

  throw new Error('Failed to claim a queued mobile build')
}

async function recoverNextStaleBuildingProjectMobileBuild({
  workerId,
}: {
  workerId?: string
} = {}): Promise<ProjectMobileBuild | null> {
  await ensureSaasTables()

  const nowIso = new Date().toISOString()
  const cutoff = new Date(Date.now() - projectMobileBuildStaleAfterMs()).toISOString()
  const effectiveWorkerId = resolveProjectMobileBuildWorkerId(workerId)

  for (let attempt = 0; attempt < PROJECT_MOBILE_BUILD_EXECUTOR_MAX_CLAIM_ATTEMPTS; attempt += 1) {
    const candidateResult = await executeQuery<ProjectMobileBuildRow>({
      query: `
        select
          id::text as id,
          project_ref,
          requested_by_gotrue_id::text as requested_by_gotrue_id,
          requested_via,
          status,
          priority,
          target,
          framework,
          profile,
          logs,
          metadata,
          inserted_at::text as inserted_at,
          updated_at::text as updated_at,
          completed_at::text as completed_at,
          last_error
        from saas.project_mobile_builds
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

    const candidate = mapProjectMobileBuildRow(candidateResult.data[0])
    const recoveredAt = new Date().toISOString()
    const timeoutMinutes = Math.round(projectMobileBuildStaleAfterMs() / 60000)
    const staleMessage = `Recovered stale mobile build after ${timeoutMinutes} minute timeout`
    const nextLogs = appendProjectMobileBuildLogs(
      candidate.logs,
      buildProjectMobileBuildLog({
        level: 'error',
        message: staleMessage,
        source: 'runtime',
      })
    )
    const nextMetadata = {
      ...candidate.metadata,
      executor: buildProjectMobileBuildExecutorMetadata(candidate.metadata, {
        attempt_error_count:
          asPositiveInteger(asRecord(candidate.metadata.executor).attempt_error_count) + 1,
        heartbeat_at: recoveredAt,
        last_error_at: recoveredAt,
        lease_expires_at: null,
        processor: PROJECT_MOBILE_BUILD_DEFAULT_WORKER_ID,
        recovery_count: asPositiveInteger(asRecord(candidate.metadata.executor).recovery_count) + 1,
        recovery_reason: 'stale_build_timeout',
        stale_recovered_at: recoveredAt,
        worker_id: effectiveWorkerId,
      }),
    }

    const recoverResult = await executeQuery<ProjectMobileBuildRow>({
      query: `
        update saas.project_mobile_builds
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
          priority,
          target,
          framework,
          profile,
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
      const build = await getProjectMobileBuildByIdUnchecked({
        buildId: candidate.id,
        ref: candidate.project_ref,
      })

      if (!build) {
        throw new Error('Recovered mobile build could not be reloaded')
      }

      await recordAuditLog({
        action: PROJECT_MOBILE_BUILD_UPDATED_AUDIT_ACTION,
        metadata: {
          build_id: build.id,
          in_flight: false,
          log_message: staleMessage,
          source: 'runtime',
          status: build.status,
        },
        projectRef: build.project_ref,
        targetDescription: build.id,
        targetType: PROJECT_MOBILE_BUILD_AUDIT_TARGET_TYPE,
      })

      return build
    }
  }

  throw new Error('Failed to recover a stale mobile build')
}

export function resolveProjectMobileBuildRuntimeSecret() {
  const dedicatedSecret = process.env.PROJECT_MOBILE_BUILD_RUNTIME_SECRET?.trim()

  if (dedicatedSecret) {
    if (dedicatedSecret.length < 32) {
      throw new Error('Missing/invalid project mobile build runtime secret (must be >= 32 chars)')
    }

    return dedicatedSecret
  }

  return resolveBuilderHandoffSecret()
}

function getProjectMobileBuildRuntimeTokenFromHeaders(
  headers?: Record<string, string | string[] | undefined>
) {
  const raw = headers?.['x-indobase-mobile-build-token']
  return Array.isArray(raw) ? raw[0] : raw
}

export function hasValidProjectMobileBuildRuntimeToken(
  headers?: Record<string, string | string[] | undefined>
) {
  const provided = getProjectMobileBuildRuntimeTokenFromHeaders(headers)?.trim()

  if (!provided) {
    return false
  }

  return provided === resolveProjectMobileBuildRuntimeSecret()
}

export async function listProjectMobileBuilds({
  claims,
  limit = 20,
  ref,
}: {
  claims: Claims
  limit?: number
  ref: string
}): Promise<ProjectMobileBuild[]> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const result = await executeQuery<ProjectMobileBuildRow>({
    query: `
      select
        b.id::text as id,
        b.project_ref,
        b.requested_by_gotrue_id::text as requested_by_gotrue_id,
        b.requested_via,
        b.status,
        b.priority,
        b.target,
        b.framework,
        b.profile,
        b.logs,
        b.metadata,
        b.inserted_at::text as inserted_at,
        b.updated_at::text as updated_at,
        b.completed_at::text as completed_at,
        b.last_error
      from saas.project_mobile_builds b
      join saas.projects p on p.ref = b.project_ref
      join saas.organization_members m on m.organization_id = p.organization_id
      where b.project_ref = $1 and m.gotrue_id = $2
      order by b.inserted_at desc
      limit $3
    `,
    parameters: [ref, gotrueId, Math.min(Math.max(limit, 1), 100)],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
  return hydrateProjectMobileBuilds((result.data ?? []).map(mapProjectMobileBuildRow))
}

export async function getProjectMobileBuild({
  buildId,
  claims,
  ref,
}: {
  buildId: string
  claims: Claims
  ref: string
}): Promise<ProjectMobileBuild | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const result = await executeQuery<ProjectMobileBuildRow>({
    query: `
      select
        b.id::text as id,
        b.project_ref,
        b.requested_by_gotrue_id::text as requested_by_gotrue_id,
        b.requested_via,
        b.status,
        b.priority,
        b.target,
        b.framework,
        b.profile,
        b.logs,
        b.metadata,
        b.inserted_at::text as inserted_at,
        b.updated_at::text as updated_at,
        b.completed_at::text as completed_at,
        b.last_error
      from saas.project_mobile_builds b
      join saas.projects p on p.ref = b.project_ref
      join saas.organization_members m on m.organization_id = p.organization_id
      where b.project_ref = $1 and b.id = $2::uuid and m.gotrue_id = $3
      limit 1
    `,
    parameters: [ref, buildId, gotrueId],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
  if (!result.data?.length) return null
  const builds = await hydrateProjectMobileBuilds([mapProjectMobileBuildRow(result.data[0])])
  return builds[0] ?? null
}

export async function createProjectMobileBuild({
  claims,
  framework = 'expo',
  metadata,
  profile = 'production',
  ref,
  requestedVia = 'studio',
  target = 'android_aab',
}: {
  claims: Claims
  framework?: ProjectMobileBuildFramework
  metadata?: Record<string, unknown>
  profile?: ProjectMobileBuildProfile
  ref: string
  requestedVia?: ProjectMobileBuildRequestedVia
  target?: ProjectMobileBuildTarget
}): Promise<ProjectMobileBuild> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const projectContext = await getProjectMobileBuildProjectContext({ claims, ref })
  if (!projectContext) {
    throw new Error('Project not found or insufficient permissions')
  }

  const orgOutstandingLimit = resolveProjectMobileBuildOrgOutstandingLimit(
    projectContext.organization_plan
  )
  const orgConcurrentLimit = resolveProjectMobileBuildOrgConcurrentLimit(projectContext.organization_plan)
  const queuePriority = resolveProjectMobileBuildPriorityForPlan(projectContext.organization_plan)
  const organizationLoad = await getProjectMobileBuildOrganizationLoad({
    organizationId: projectContext.organization_id,
  })

  if (organizationLoad.outstanding_count >= orgOutstandingLimit) {
    throw new Error(
      `This organization already has ${organizationLoad.outstanding_count} active mobile build requests. The current ${projectContext.organization_plan} plan allows ${orgOutstandingLimit} queued or running Android builds at once.`
    )
  }

  const existingBuildResult = await executeQuery<{ id: string; status: ProjectMobileBuildStatus }>({
    query: `
      select id::text as id, status
      from saas.project_mobile_builds
      where project_ref = $1 and status in ('requested', 'building')
      order by inserted_at desc
      limit 1
    `,
    parameters: [ref],
    actorId: gotrueId,
  })
  if (existingBuildResult.error) throw existingBuildResult.error
  if (existingBuildResult.data?.length) {
    throw new Error('An active Android bundle build is already in progress for this project')
  }

  const normalizedTarget = normalizeProjectMobileBuildTarget(target)
  const normalizedFramework = normalizeProjectMobileBuildFramework(framework)
  const normalizedProfile = normalizeProjectMobileBuildProfile(profile)
  const normalizedMetadata = {
    ...normalizeProjectMobileBuildMetadata(metadata, {
      framework: normalizedFramework,
      projectRef: ref,
    }),
    organization_plan: projectContext.organization_plan,
    priority: queuePriority,
    queue_limits: {
      org_concurrent_limit: orgConcurrentLimit,
      org_outstanding_limit: orgOutstandingLimit,
    },
  }

  const initialLog = buildProjectMobileBuildLog({
    message: `Android bundle build requested via ${requestedVia} (${queuePriority} priority)`,
    source: requestedVia === 'builder' ? 'builder' : requestedVia === 'api' ? 'api' : 'studio',
  })

  const result = await executeQuery<ProjectMobileBuildRow>({
    query: `
      insert into saas.project_mobile_builds (
        project_ref,
        requested_by_gotrue_id,
        requested_via,
        status,
        priority,
        target,
        framework,
        profile,
        logs,
        metadata
      ) values ($1, $2::uuid, $3, 'requested', $4, $5, $6, $7, $8::jsonb, $9::jsonb)
      returning
        id::text as id,
        project_ref,
        requested_by_gotrue_id::text as requested_by_gotrue_id,
        requested_via,
        status,
        priority,
        target,
        framework,
        profile,
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
      queuePriority,
      normalizedTarget,
      normalizedFramework,
      normalizedProfile,
      JSON.stringify([initialLog]),
      JSON.stringify(normalizedMetadata),
    ],
    actorId: gotrueId,
  })
  if (result.error) {
    if (isActiveProjectMobileBuildConflict(result.error)) {
      throw new Error('An active Android bundle build is already in progress for this project')
    }

    throw result.error
  }
  if (!result.data?.length) {
    throw new Error('Failed to create mobile build request')
  }

  const builds = await hydrateProjectMobileBuilds([mapProjectMobileBuildRow(result.data[0])])
  const build = builds[0]

  if (!build) {
    throw new Error('Failed to load created mobile build')
  }

  await recordAuditLog({
    action: PROJECT_MOBILE_BUILD_REQUESTED_AUDIT_ACTION,
    claims,
    metadata: {
      application_id: build.metadata.android_package_name,
      build_id: build.id,
      framework: build.framework,
      organization_plan: projectContext.organization_plan,
      priority: build.priority,
      profile: build.profile,
      requested_via: requestedVia,
      status: build.status,
      target: build.target,
    },
    projectRef: ref,
    targetDescription: build.id,
    targetType: PROJECT_MOBILE_BUILD_AUDIT_TARGET_TYPE,
  })

  return build
}

export async function updateProjectMobileBuild({
  artifacts,
  buildId,
  lastError,
  logLevel,
  logMessage,
  metadataPatch,
  ref,
  source,
  status,
}: {
  artifacts?: CreateProjectMobileBuildArtifact[]
  buildId: string
  lastError?: string | null
  logLevel?: ProjectMobileBuildLogLevel
  logMessage?: string
  metadataPatch?: Record<string, unknown>
  ref: string
  source: ProjectMobileBuildLogSource
  status?: ProjectMobileBuildStatus
}): Promise<ProjectMobileBuild> {
  await ensureSaasTables()
  const existingResult = await executeQuery<ProjectMobileBuildRow>({
    query: `
      select
        id::text as id,
        project_ref,
        requested_by_gotrue_id::text as requested_by_gotrue_id,
        requested_via,
        status,
        priority,
        target,
        framework,
        profile,
        logs,
        metadata,
        inserted_at::text as inserted_at,
        updated_at::text as updated_at,
        completed_at::text as completed_at,
        last_error
      from saas.project_mobile_builds
      where project_ref = $1 and id = $2::uuid
      limit 1
    `,
    parameters: [ref, buildId],
  })
  if (existingResult.error) throw existingResult.error
  if (!existingResult.data?.length) {
    throw new Error('Mobile build not found')
  }

  const current = mapProjectMobileBuildRow(existingResult.data[0])
  const nextStatus = status ?? current.status
  assertValidProjectMobileBuildTransition(current.status, nextStatus)

  const nextLog =
    logMessage?.trim() || current.status !== nextStatus
      ? buildProjectMobileBuildLog({
          level: logLevel ?? (nextStatus === 'failed' ? 'error' : 'info'),
          message:
            logMessage?.trim() ||
            `Mobile build status changed from ${current.status} to ${nextStatus}`,
          source,
        })
      : undefined

  const nextLogs = appendProjectMobileBuildLogs(current.logs, nextLog)
  const timestamps = resolveProjectMobileBuildTimestamps({
    currentCompletedAt: current.completed_at,
    nextStatus,
  })
  const nextLastError =
    nextStatus === 'failed'
      ? lastError?.trim() || current.last_error || 'Mobile build failed'
      : nextStatus === 'ready'
        ? null
        : lastError === undefined
          ? current.last_error
          : lastError
  const nextMetadata = {
    ...current.metadata,
    ...(metadataPatch ?? {}),
  }

  const updateResult = await executeQuery<ProjectMobileBuildRow>({
    query: `
      update saas.project_mobile_builds
      set
        status = $3,
        logs = $4::jsonb,
        metadata = $5::jsonb,
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
        priority,
        target,
        framework,
        profile,
        logs,
        metadata,
        inserted_at::text as inserted_at,
        updated_at::text as updated_at,
        completed_at::text as completed_at,
        last_error
    `,
    parameters: [
      ref,
      buildId,
      nextStatus,
      JSON.stringify(nextLogs),
      JSON.stringify(nextMetadata),
      timestamps.completed_at,
      nextLastError,
    ],
  })
  if (updateResult.error) throw updateResult.error
  if (!updateResult.data?.length) {
    throw new Error('Failed to update mobile build')
  }

  if (artifacts?.length) {
    await createProjectMobileBuildArtifactsInternal({ artifacts, buildId })
  }

  const build = await getProjectMobileBuildByIdUnchecked({ buildId, ref })

  if (!build) {
    throw new Error('Updated mobile build could not be reloaded')
  }

  await recordAuditLog({
    action: PROJECT_MOBILE_BUILD_UPDATED_AUDIT_ACTION,
    metadata: {
      artifact_count: build.artifacts.length,
      build_id: build.id,
      in_flight: isInFlightProjectMobileBuild(build.status),
      log_message: nextLog?.message ?? null,
      source,
      status: build.status,
    },
    projectRef: ref,
    targetDescription: build.id,
    targetType: PROJECT_MOBILE_BUILD_AUDIT_TARGET_TYPE,
  })

  return build
}

export async function renewProjectMobileBuildHeartbeat({
  buildId,
  logLevel,
  logMessage,
  metadataPatch,
  ref,
  source = 'runtime',
  workerId,
}: {
  buildId: string
  logLevel?: ProjectMobileBuildLogLevel
  logMessage?: string
  metadataPatch?: Record<string, unknown>
  ref: string
  source?: ProjectMobileBuildLogSource
  workerId?: string
}): Promise<ProjectMobileBuild> {
  await ensureSaasTables()

  const existingResult = await executeQuery<ProjectMobileBuildRow>({
    query: `
      select
        id::text as id,
        project_ref,
        requested_by_gotrue_id::text as requested_by_gotrue_id,
        requested_via,
        status,
        priority,
        target,
        framework,
        profile,
        logs,
        metadata,
        inserted_at::text as inserted_at,
        updated_at::text as updated_at,
        completed_at::text as completed_at,
        last_error
      from saas.project_mobile_builds
      where project_ref = $1 and id = $2::uuid
      limit 1
    `,
    parameters: [ref, buildId],
  })
  if (existingResult.error) throw existingResult.error
  if (!existingResult.data?.length) {
    throw new Error('Mobile build not found')
  }

  const current = mapProjectMobileBuildRow(existingResult.data[0])
  if (current.status !== 'building') {
    throw new Error('Mobile build heartbeat can only renew building builds')
  }

  const currentWorkerId = asRecord(current.metadata.executor).worker_id
  const effectiveWorkerId = resolveProjectMobileBuildWorkerId(workerId)
  if (
    typeof currentWorkerId === 'string' &&
    currentWorkerId.trim() &&
    currentWorkerId.trim() !== effectiveWorkerId
  ) {
    throw new Error('Mobile build heartbeat worker does not match the active lease owner')
  }

  const heartbeat = buildProjectMobileBuildHeartbeatMetadata({
    metadata: current.metadata,
    workerId: effectiveWorkerId,
  })

  return updateProjectMobileBuild({
    buildId,
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

export async function processNextProjectMobileBuild({
  workerId,
}: {
  workerId?: string
} = {}): Promise<ProcessProjectMobileBuildResult> {
  const effectiveWorkerId = resolveProjectMobileBuildWorkerId(workerId)
  const recoveredBuild = await recoverNextStaleBuildingProjectMobileBuild({
    workerId: effectiveWorkerId,
  })

  if (recoveredBuild) {
    return {
      build: recoveredBuild,
      outcome: 'failed',
    }
  }

  const claimedBuild = await claimNextRequestedProjectMobileBuild({
    workerId: effectiveWorkerId,
  })

  if (!claimedBuild) {
    return {
      build: null,
      outcome: 'idle',
    }
  }

  return {
    build: claimedBuild,
    outcome: 'claimed',
  }
}

export async function processProjectMobileBuildBatch({
  limit = 1,
  workerId,
}: {
  limit?: number
  workerId?: string
} = {}): Promise<ProcessProjectMobileBuildBatchResult> {
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 20)
  const results: ProcessProjectMobileBuildResult[] = []
  let claimed = 0
  let failed = 0

  for (let index = 0; index < normalizedLimit; index += 1) {
    const result = await processNextProjectMobileBuild({ workerId })
    results.push(result)

    if (result.outcome === 'idle') {
      break
    }

    if (result.outcome === 'claimed') {
      claimed += 1
    } else if (result.outcome === 'failed') {
      failed += 1
    }
  }

  return {
    claimed,
    failed,
    idle: results.length === 0 || results[results.length - 1]?.outcome === 'idle',
    processed: claimed + failed,
    results,
  }
}
