/**
 * Auto-resume execution.publish after a queued Build becomes ready.
 * Hooks the existing project_deployments → ready transition (Builder upload /
 * publishDeploymentArtifacts / deployment executor) — no new microservice.
 */
import { createHash } from 'node:crypto'

import type { ProjectDeployment } from './deployments'
import { ensureSaasTables } from './platform'
import { executeQuery } from './query'
import { ensureTenantSiteHosting } from './tenant-data-plane-provision'

export type OsPublishRecord = {
  execution_id?: string | null
  live_url?: string | null
  published_at?: string | null
  snapshot_id?: string | null
  content_hash?: string | null
  artifact_ref?: string | null
  /** published | queued | verify_failed */
  publish_status?: string | null
  kind?: string | null
  freeze_source?: string | null
  resume_pending?: boolean | null
  deployment_id?: string | null
  resumed_at?: string | null
  verify_failed_at?: string | null
  verify_failed_message?: string | null
}

/** True when Launch stamped a queued os_publish that still needs MarkLive completion. */
export function isOsPublishResumePending(osPublish: unknown): boolean {
  if (!osPublish || typeof osPublish !== 'object' || Array.isArray(osPublish)) {
    return false
  }
  const row = osPublish as OsPublishRecord
  if (row.resume_pending === true) return true
  return row.publish_status === 'queued'
}

export function artifactRefFromReadyDeployment(deployment: ProjectDeployment): string | undefined {
  const artifacts = deployment.metadata?.hosting_artifacts
  if (artifacts && typeof artifacts === 'object' && !Array.isArray(artifacts)) {
    const prefix = (artifacts as Record<string, unknown>).prefix
    if (typeof prefix === 'string' && prefix.trim()) {
      return prefix.trim()
    }
  }
  if (typeof deployment.metadata?.artifact_ref === 'string' && deployment.metadata.artifact_ref.trim()) {
    return deployment.metadata.artifact_ref.trim()
  }
  return `sites/${deployment.id}`
}

function readyDeploymentHasHostingArtifacts(deployment: ProjectDeployment): boolean {
  const artifacts = deployment.metadata?.hosting_artifacts
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
    return false
  }
  const row = artifacts as Record<string, unknown>
  const fileCount = typeof row.file_count === 'number' ? row.file_count : 0
  const prefix = typeof row.prefix === 'string' ? row.prefix.trim() : ''
  return fileCount > 0 || Boolean(prefix)
}

export function resolveResumeLiveUrl({
  pending,
  deployment,
  hostDomain = 'indobase.in',
}: {
  pending: OsPublishRecord
  deployment: ProjectDeployment
  hostDomain?: string
}): string {
  if (typeof pending.live_url === 'string' && pending.live_url.trim()) {
    return pending.live_url.trim()
  }
  if (deployment.target_url?.trim()) {
    return deployment.target_url.trim()
  }
  const domain = hostDomain && hostDomain !== 'localhost' ? hostDomain : 'indobase.in'
  return `https://${deployment.project_ref}.${domain}`
}

/**
 * After deployment becomes ready: finish Deploy (site hosting) + MarkLive published.
 * Best-effort — never throws into the deployment status write path.
 */
export async function resumeOsPublishAfterDeploymentReady({
  ref,
  deployment,
}: {
  ref: string
  deployment: ProjectDeployment
}): Promise<{ resumed: boolean; liveUrl?: string; reason?: string }> {
  if (deployment.status !== 'ready') {
    return { resumed: false, reason: 'not_ready' }
  }

  try {
    await ensureSaasTables()

    const pending = await loadPendingOsPublish({ ref, deployment })
    if (!pending) {
      return { resumed: false, reason: 'no_pending' }
    }

    // Prefer the deployment Launch queued against. Builder often creates a *new* ready
    // row via /deployments/builder instead of finishing the queued one — allow that when
    // the ready row has hosting artifacts.
    if (
      typeof pending.deployment_id === 'string' &&
      pending.deployment_id.trim() &&
      pending.deployment_id !== deployment.id &&
      !readyDeploymentHasHostingArtifacts(deployment)
    ) {
      return { resumed: false, reason: 'deployment_mismatch' }
    }

    const liveUrl = resolveResumeLiveUrl({ pending, deployment })
    const artifactRef = artifactRefFromReadyDeployment(deployment)

    try {
      await ensureTenantSiteHosting(ref)
    } catch {
      // Hosting ensure is best-effort — Builder publish often already registered the route.
    }

    const publishedAt = new Date().toISOString()
    const osPublish: OsPublishRecord = {
      ...pending,
      live_url: liveUrl,
      published_at: publishedAt,
      artifact_ref: artifactRef ?? pending.artifact_ref ?? null,
      publish_status: 'published',
      resume_pending: false,
      resumed_at: publishedAt,
      deployment_id: deployment.id,
      kind: 'artifact',
      freeze_source: pending.freeze_source ?? 'ready_deployment',
      snapshot_id: pending.snapshot_id ?? `deploy_${deployment.id}`,
    }

    await persistOsPublishPublished({
      projectRef: ref,
      osPublish,
      deploymentId: deployment.id,
      liveUrl,
    })

    // ConfigureBusiness: best-effort SEO/discovery stubs (same soft path as sync Launch).
    try {
      const { configureOsBusiness } = await import('./os-business-configure')
      await configureOsBusiness({
        workspaceRef: ref,
        liveUrl,
      })
    } catch {
      // Best-effort — resume already succeeded.
    }

    // Operate loop: same post-publish verify + AI operator as sync Launch.
    try {
      const { runPostPublishOperateHook } = await import('./os-ai-operator')
      await runPostPublishOperateHook({
        workspaceRef: ref,
        liveUrl,
      })
    } catch {
      // Best-effort — resume already succeeded.
    }

    return { resumed: true, liveUrl }
  } catch (error) {
    console.warn(
      '[os-publish-resume] failed for %s / %s: %s',
      ref,
      deployment.id,
      error instanceof Error ? error.message : String(error),
    )
    return { resumed: false, reason: 'error' }
  }
}

async function loadPendingOsPublish({
  ref,
  deployment,
}: {
  ref: string
  deployment: ProjectDeployment
}): Promise<OsPublishRecord | null> {
  const fromDeployment = asOsPublish(deployment.metadata?.os_publish)
  if (fromDeployment && isOsPublishResumePending(fromDeployment)) {
    return fromDeployment
  }

  const fromResumeFlag = deployment.metadata?.os_publish_resume
  if (fromResumeFlag && typeof fromResumeFlag === 'object' && !Array.isArray(fromResumeFlag)) {
    const flagged = fromResumeFlag as OsPublishRecord & { pending?: boolean }
    if (flagged.pending === true || isOsPublishResumePending(flagged)) {
      const projectPending = await readProjectOsPublish(ref)
      return projectPending && isOsPublishResumePending(projectPending)
        ? projectPending
        : { ...flagged, publish_status: flagged.publish_status ?? 'queued', resume_pending: true }
    }
  }

  const projectPending = await readProjectOsPublish(ref)
  if (projectPending && isOsPublishResumePending(projectPending)) {
    return projectPending
  }

  return null
}

function asOsPublish(value: unknown): OsPublishRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as OsPublishRecord
}

async function readProjectOsPublish(ref: string): Promise<OsPublishRecord | null> {
  const result = await executeQuery<{ auth_config: Record<string, unknown> | null }>({
    query: `
      select coalesce(auth_config, '{}'::jsonb) as auth_config
      from saas.projects
      where ref = $1
      limit 1
    `,
    parameters: [ref],
  })
  if (result.error || !result.data?.length) return null
  const authConfig = result.data[0].auth_config
  if (!authConfig || typeof authConfig !== 'object') return null
  return asOsPublish(authConfig.os_publish)
}

async function persistOsPublishPublished({
  projectRef,
  osPublish,
  deploymentId,
  liveUrl,
}: {
  projectRef: string
  osPublish: OsPublishRecord
  deploymentId: string
  liveUrl: string
}) {
  const projectResult = await executeQuery({
    query: `
      update saas.projects
      set auth_config = coalesce(auth_config, '{}'::jsonb) || jsonb_build_object('os_publish', $2::jsonb)
      where ref = $1
    `,
    parameters: [projectRef, JSON.stringify(osPublish)],
  })
  if (projectResult.error) throw projectResult.error

  // Avoid importing updateProjectDeployment (circular with the ready-hook). Patch metadata directly.
  const deployResult = await executeQuery({
    query: `
      update saas.project_deployments
      set
        target_url = coalesce(nullif($3, ''), target_url),
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'os_publish', $4::jsonb,
            'os_publish_resume', jsonb_build_object('pending', false, 'resumed_at', $5::text)
          ),
        updated_at = now()
      where project_ref = $1 and id = $2::uuid
    `,
    parameters: [
      projectRef,
      deploymentId,
      liveUrl,
      JSON.stringify(osPublish),
      osPublish.resumed_at ?? new Date().toISOString(),
    ],
  })
  if (deployResult.error) throw deployResult.error
}

/** Content fingerprint for queued build inputs (not live editor state). */
export function contentHashFromSourceFiles(files: Record<string, string>): string {
  const hash = createHash('sha256')
  for (const path of Object.keys(files).sort()) {
    hash.update(path)
    hash.update('\0')
    hash.update(files[path] ?? '')
    hash.update('\0')
  }
  return `sha256:${hash.digest('hex')}`
}
