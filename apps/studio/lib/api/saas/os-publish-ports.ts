/**
 * Studio ports for execution.publish — FreezeSnapshot + Build wrap saas.project_deployments
 * and publishDeploymentArtifacts. Never freezes mutable live editor state.
 */
import { createHash } from 'node:crypto'

import type {
  BuildArtifactPort,
  CapabilityEnsurePort,
  FreezeSnapshotPort,
  FrozenPublishSnapshot,
  MarkLivePort,
} from '@indobase/platform'

import { publishDeploymentArtifacts } from './deployment-artifacts'
import {
  createProjectDeployment,
  listProjectDeployments,
  updateProjectDeployment,
  type ProjectDeployment,
} from './deployments'
import { ensureOsCapability } from './os-ensurer'
import { contentHashFromSourceFiles } from './os-publish-resume'
import type { Claims } from './platform'
import { ensureSaasTables, getGotrueUserId } from './platform'
import { executeQuery } from './query'

const BUILD_QUEUED_MESSAGE =
  'Your site is still building. Launch will finish when the build is ready.'
const BUILD_INPUTS_REQUIRED_MESSAGE =
  "Your site isn't ready to publish yet. Finish building, then try Launch again."
const BUILD_FAILED_MESSAGE =
  'We could not finish building your site right now. Please try again in a moment.'

/** Exported for unit tests — prefer explicit hash fields over hosting_artifacts fingerprint. */
export function contentHashFromMetadata(metadata: Record<string, unknown>): string | undefined {
  for (const key of ['content_hash', 'contentHash', 'checksum_sha256', 'checksumSha256', 'etag'] as const) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  const artifacts = metadata.hosting_artifacts
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
    return undefined
  }
  const row = artifacts as Record<string, unknown>
  if (typeof row.content_hash === 'string' && row.content_hash.trim()) {
    return row.content_hash.trim()
  }
  const fileCount = typeof row.file_count === 'number' ? row.file_count : undefined
  const totalBytes = typeof row.total_bytes === 'number' ? row.total_bytes : undefined
  const prefix = typeof row.prefix === 'string' ? row.prefix : undefined
  if (fileCount == null && totalBytes == null && !prefix) {
    return undefined
  }
  return `files:${fileCount ?? 0}:bytes:${totalBytes ?? 0}:prefix:${prefix ?? ''}`
}

export function hasHostingArtifacts(metadata: Record<string, unknown>): boolean {
  const artifacts = metadata.hosting_artifacts
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
    return false
  }
  const row = artifacts as Record<string, unknown>
  const fileCount = typeof row.file_count === 'number' ? row.file_count : 0
  const prefix = typeof row.prefix === 'string' ? row.prefix.trim() : ''
  return fileCount > 0 || Boolean(prefix)
}

export function artifactRefFromMetadata(
  metadata: Record<string, unknown>,
  deploymentId: string,
): string {
  const artifacts = metadata.hosting_artifacts
  if (artifacts && typeof artifacts === 'object' && !Array.isArray(artifacts)) {
    const prefix = (artifacts as Record<string, unknown>).prefix
    if (typeof prefix === 'string' && prefix.trim()) {
      return prefix
    }
  }
  return `sites/${deploymentId}`
}

/** Content-addressed digest of publishable file map — immutable freeze input. */
export function contentHashFromArtifactFiles(files: Record<string, string>): string {
  const hash = createHash('sha256')
  for (const path of Object.keys(files).sort()) {
    hash.update(path)
    hash.update('\0')
    hash.update(files[path] ?? '')
    hash.update('\0')
  }
  return `sha256:${hash.digest('hex')}`
}

export function extractPublishableArtifactFiles(
  payload?: Record<string, unknown>,
): Record<string, string> | null {
  const raw = payload?.artifacts ?? payload?.files
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof path !== 'string' || !path.trim()) continue
    if (typeof content !== 'string') continue
    out[path.trim()] = content
  }
  return Object.keys(out).length > 0 ? out : null
}

/** Project / Builder sources that may need server-build before hosting artifacts exist. */
export function extractBuildableSourceFiles(
  payload?: Record<string, unknown>,
): Record<string, string> | null {
  const raw = payload?.sourceFiles ?? payload?.source_files
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof path !== 'string' || !path.trim()) continue
    if (typeof content !== 'string') continue
    out[path.trim()] = content
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * Static hosting inputs (index.html, no package.json build script) can publish
 * via publishDeploymentArtifacts without Builder server-build.
 */
export function looksLikeStaticHostingArtifacts(files: Record<string, string>): boolean {
  const paths = Object.keys(files)
  const hasIndex = paths.some((p) => p === 'index.html' || p.endsWith('/index.html'))
  if (!hasIndex) return false

  const pkg =
    files['package.json'] ??
    files['./package.json'] ??
    Object.entries(files).find(([path]) => path === 'package.json' || path.endsWith('/package.json'))?.[1]

  if (typeof pkg === 'string' && /"build"\s*:/.test(pkg)) {
    return false
  }
  return true
}

export function hasKnownBuilderDraft(payload?: Record<string, unknown>): boolean {
  for (const key of [
    'draftId',
    'draft_id',
    'builderDraftId',
    'builder_draft_id',
    'previewDraftId',
    'preview_draft_id',
  ] as const) {
    const value = payload?.[key]
    if (typeof value === 'string' && value.trim()) return true
  }
  return payload?.builder_draft === true || payload?.builderDraft === true
}

/** Prefer ready rows with hosting_artifacts (immutable), then any ready, never live editor. */
export function selectReadyDeploymentForFreeze(
  deployments: ProjectDeployment[],
  explicitDeploymentId?: string,
): ProjectDeployment | undefined {
  if (explicitDeploymentId) {
    return deployments.find((d) => d.id === explicitDeploymentId)
  }
  const ready = deployments.filter((d) => d.status === 'ready')
  return (
    ready.find((d) => hasHostingArtifacts(d.metadata)) ??
    ready[0]
  )
}

export function selectInProgressDeployment(
  deployments: ProjectDeployment[],
): ProjectDeployment | undefined {
  return deployments.find((d) => d.status === 'requested' || d.status === 'building')
}

function freezeFromReadyDeployment(preferred: ProjectDeployment): FrozenPublishSnapshot {
  return {
    snapshotId: `deploy_${preferred.id}`,
    deploymentId: preferred.id,
    contentHash: contentHashFromMetadata(preferred.metadata),
    kind: 'artifact',
    artifactRef: artifactRefFromMetadata(preferred.metadata, preferred.id),
    source: 'ready_deployment',
  }
}

export function createStudioFreezeSnapshotPort({
  claims,
}: {
  claims: Claims
}): FreezeSnapshotPort {
  return {
    async freezeSnapshot(input) {
      const explicitDeploymentId =
        typeof input.payload?.deploymentId === 'string'
          ? input.payload.deploymentId
          : typeof input.payload?.deployment_id === 'string'
            ? input.payload.deployment_id
            : undefined

      const payloadFiles = extractPublishableArtifactFiles(input.payload)
      const sourceFiles = extractBuildableSourceFiles(input.payload)

      try {
        const deployments = await listProjectDeployments({
          claims,
          ref: input.projectRef,
          limit: 25,
        })

        const preferred = selectReadyDeploymentForFreeze(deployments, explicitDeploymentId)

        if (preferred && preferred.status === 'ready') {
          return {
            ok: true,
            snapshot: freezeFromReadyDeployment(preferred),
          }
        }

        if (explicitDeploymentId) {
          const inProgress = deployments.find((d) => d.id === explicitDeploymentId)
          if (inProgress && (inProgress.status === 'requested' || inProgress.status === 'building')) {
            return {
              ok: true,
              snapshot: {
                snapshotId: `deploy_${inProgress.id}`,
                deploymentId: inProgress.id,
                contentHash: contentHashFromMetadata(inProgress.metadata),
                kind: 'hosting-only',
                artifactRef: artifactRefFromMetadata(inProgress.metadata, inProgress.id),
                source: 'in_progress_deployment',
              },
            }
          }
          return {
            ok: false,
            message: BUILD_INPUTS_REQUIRED_MESSAGE,
          }
        }

        // Immutable content-addressed freeze from payload files (not live editor state).
        if (payloadFiles) {
          const contentHash = contentHashFromArtifactFiles(payloadFiles)
          return {
            ok: true,
            snapshot: {
              snapshotId: `payload_${contentHash.replace(/^sha256:/, '').slice(0, 24)}`,
              contentHash,
              kind: 'artifact',
              artifactRef: input.projectRef,
              source: 'payload_artifacts',
            },
          }
        }

        // Static sourceFiles act as publishable artifacts for freeze (Builder dist-like inputs).
        if (sourceFiles && looksLikeStaticHostingArtifacts(sourceFiles)) {
          const contentHash = contentHashFromArtifactFiles(sourceFiles)
          return {
            ok: true,
            snapshot: {
              snapshotId: `payload_${contentHash.replace(/^sha256:/, '').slice(0, 24)}`,
              contentHash,
              kind: 'artifact',
              artifactRef: input.projectRef,
              source: 'payload_artifacts',
            },
          }
        }

        // Buildable sources / Builder draft — hosting freeze; Build queues async + auto-resume.
        if ((sourceFiles && !looksLikeStaticHostingArtifacts(sourceFiles)) || hasKnownBuilderDraft(input.payload)) {
          const contentHash = sourceFiles
            ? contentHashFromSourceFiles(sourceFiles)
            : undefined
          return {
            ok: true,
            snapshot: {
              snapshotId: `hosting_${input.projectRef}_${Date.now()}`,
              contentHash,
              kind: 'hosting-only',
              artifactRef: input.projectRef,
              source: 'hosting_placeholder',
            },
          }
        }

        // Documented gap: no ready artifact — hosting-only placeholder (Launch still works).
        // Never invent a freeze from mutable live editor / workspace tree.
        return {
          ok: true,
          snapshot: {
            snapshotId: `hosting_${input.projectRef}_${Date.now()}`,
            kind: 'hosting-only',
            artifactRef: input.projectRef,
            source: 'hosting_placeholder',
          },
        }
      } catch {
        return {
          ok: false,
          message: 'We could not prepare your launch snapshot. Please try again.',
        }
      }
    },
  }
}

export function createStudioBuildArtifactPort({
  claims,
}: {
  claims: Claims
}): BuildArtifactPort {
  return {
    async build({ snapshot, projectRef, payload }) {
      // Ready frozen deployment — resolve artifact ref only (already published).
      if (snapshot.kind === 'artifact' && snapshot.source === 'ready_deployment') {
        return {
          ok: true,
          status: 'ready',
          artifactRef: snapshot.artifactRef ?? snapshot.snapshotId,
          buildId: snapshot.deploymentId,
        }
      }

      const payloadFiles = extractPublishableArtifactFiles(payload)
      const sourceFiles = extractBuildableSourceFiles(payload)

      // Content-addressed payload from Freeze — publish via existing Studio path.
      if (payloadFiles && (snapshot.source === 'payload_artifacts' || snapshot.kind === 'hosting-only')) {
        try {
          return await publishPayloadArtifactsInline({
            claims,
            projectRef,
            files: payloadFiles,
            contentHash: snapshot.contentHash ?? contentHashFromArtifactFiles(payloadFiles),
          })
        } catch (error) {
          const raw = error instanceof Error ? error.message : ''
          if (raw.toLowerCase().includes('already in progress')) {
            return await queueOnActiveOrCreate({
              claims,
              projectRef,
              snapshot,
              reason: 'payload_conflict',
            })
          }
          return {
            ok: false,
            message: looksInfra(raw) ? BUILD_FAILED_MESSAGE : raw || BUILD_FAILED_MESSAGE,
          }
        }
      }

      // Static sourceFiles (dist-like) — same publishDeploymentArtifacts path as artifacts.
      if (
        sourceFiles &&
        looksLikeStaticHostingArtifacts(sourceFiles) &&
        (snapshot.source === 'payload_artifacts' ||
          snapshot.kind === 'hosting-only' ||
          snapshot.source === 'hosting_placeholder')
      ) {
        try {
          return await publishPayloadArtifactsInline({
            claims,
            projectRef,
            files: sourceFiles,
            contentHash: snapshot.contentHash ?? contentHashFromSourceFiles(sourceFiles),
          })
        } catch (error) {
          const raw = error instanceof Error ? error.message : ''
          if (raw.toLowerCase().includes('already in progress')) {
            return await queueOnActiveOrCreate({
              claims,
              projectRef,
              snapshot,
              reason: 'source_static_conflict',
            })
          }
          return {
            ok: false,
            message: looksInfra(raw) ? BUILD_FAILED_MESSAGE : raw || BUILD_FAILED_MESSAGE,
          }
        }
      }

      // Artifact freeze without deployment id (payload path that somehow lost files).
      if (snapshot.kind === 'artifact' && snapshot.source === 'payload_artifacts' && !payloadFiles) {
        return {
          ok: false,
          message: BUILD_INPUTS_REQUIRED_MESSAGE,
        }
      }

      if (snapshot.kind === 'artifact') {
        return {
          ok: true,
          status: 'ready',
          artifactRef: snapshot.artifactRef ?? snapshot.snapshotId,
          buildId: snapshot.deploymentId,
        }
      }

      // Hosting-only: check for in-progress deploy → structured queued (no new build service).
      try {
        const deployments = await listProjectDeployments({
          claims,
          ref: projectRef,
          limit: 10,
        })
        const inProgress =
          (snapshot.deploymentId
            ? deployments.find((d) => d.id === snapshot.deploymentId)
            : undefined) ?? selectInProgressDeployment(deployments)

        if (
          inProgress &&
          (inProgress.status === 'requested' || inProgress.status === 'building')
        ) {
          return {
            ok: true,
            status: 'queued',
            buildId: inProgress.id,
            artifactRef: artifactRefFromMetadata(inProgress.metadata, inProgress.id),
            message: BUILD_QUEUED_MESSAGE,
          }
        }
      } catch {
        // Fall through.
      }

      // Buildable sources or known Builder draft — queue async deploy; auto-resume on ready.
      const needsAsyncBuild =
        Boolean(sourceFiles && !looksLikeStaticHostingArtifacts(sourceFiles)) ||
        hasKnownBuilderDraft(payload)

      if (needsAsyncBuild) {
        try {
          return await queueBuildingDeploymentForSources({
            claims,
            projectRef,
            sourceFiles,
            payload,
          })
        } catch (error) {
          const raw = error instanceof Error ? error.message : ''
          if (raw.toLowerCase().includes('already in progress')) {
            return await queueOnActiveOrCreate({
              claims,
              projectRef,
              snapshot,
              reason: 'async_build_conflict',
            })
          }
          return {
            ok: false,
            message: looksInfra(raw) ? BUILD_FAILED_MESSAGE : raw || BUILD_FAILED_MESSAGE,
          }
        }
      }

      // Explicit request for a site build without inputs / ready artifact — customer-safe fail.
      const forceBuild =
        payload?.require_site_build === true ||
        payload?.requireSiteBuild === true ||
        payload?.force_build === true

      if (forceBuild) {
        return {
          ok: false,
          message: BUILD_INPUTS_REQUIRED_MESSAGE,
        }
      }

      // Hosting-only Launch (no Builder artifacts yet) — consistent with PR 2 UX.
      return {
        ok: true,
        status: 'ready',
        artifactRef: snapshot.artifactRef ?? projectRef,
      }
    },
  }
}

async function queueOnActiveOrCreate({
  claims,
  projectRef,
  snapshot,
  reason,
}: {
  claims: Claims
  projectRef: string
  snapshot: FrozenPublishSnapshot
  reason: string
}): Promise<Extract<Awaited<ReturnType<BuildArtifactPort['build']>>, { ok: true; status: 'queued' }>> {
  try {
    const deployments = await listProjectDeployments({ claims, ref: projectRef, limit: 10 })
    const inProgress =
      (snapshot.deploymentId
        ? deployments.find((d) => d.id === snapshot.deploymentId)
        : undefined) ?? selectInProgressDeployment(deployments)
    if (inProgress && (inProgress.status === 'requested' || inProgress.status === 'building')) {
      return {
        ok: true,
        status: 'queued',
        buildId: inProgress.id,
        artifactRef: artifactRefFromMetadata(inProgress.metadata, inProgress.id),
        message: BUILD_QUEUED_MESSAGE,
      }
    }
  } catch {
    // Fall through to create.
  }

  return queueBuildingDeploymentForSources({
    claims,
    projectRef,
    sourceFiles: null,
    payload: { queue_reason: reason },
  })
}

/**
 * Create a building deployment so Builder / publishDeploymentArtifacts can finish async.
 * Launch returns queued immediately; resumeOsPublishAfterDeploymentReady completes MarkLive.
 */
async function queueBuildingDeploymentForSources({
  claims,
  projectRef,
  sourceFiles,
  payload,
}: {
  claims: Claims
  projectRef: string
  sourceFiles: Record<string, string> | null
  payload?: Record<string, unknown>
}): Promise<Extract<Awaited<ReturnType<BuildArtifactPort['build']>>, { ok: true; status: 'queued' }>> {
  const contentHash = sourceFiles ? contentHashFromSourceFiles(sourceFiles) : undefined
  const deployment = await createProjectDeployment({
    claims,
    ref: projectRef,
    requestedVia: 'api',
    skipInlineProcessing: true,
    metadata: {
      source: 'os_execution_publish',
      os_build: {
        kind: sourceFiles ? 'source_files' : 'builder_draft',
        queued_at: new Date().toISOString(),
        file_count: sourceFiles ? Object.keys(sourceFiles).length : 0,
        content_hash: contentHash ?? null,
        draft_id:
          typeof payload?.draftId === 'string'
            ? payload.draftId
            : typeof payload?.draft_id === 'string'
              ? payload.draft_id
              : null,
      },
      os_publish_resume: {
        pending: true,
        queued_at: new Date().toISOString(),
      },
    },
  })

  await updateProjectDeployment({
    deploymentId: deployment.id,
    ref: projectRef,
    source: 'api',
    status: 'building',
    logMessage: 'Launch queued site build — finishing when artifacts are ready',
    metadataPatch: {
      os_publish_resume: {
        pending: true,
        queued_at: new Date().toISOString(),
      },
    },
  })

  // Best-effort: if static-enough sources arrived late, publish on the existing async path.
  // Vite/package projects stay building until Builder posts artifacts (auto-resume on ready).
  if (sourceFiles && looksLikeStaticHostingArtifacts(sourceFiles)) {
    schedulePublishDeploymentArtifacts({
      claims,
      projectRef,
      deploymentId: deployment.id,
      files: sourceFiles,
    })
  }

  return {
    ok: true,
    status: 'queued',
    buildId: deployment.id,
    artifactRef: artifactRefFromMetadata(deployment.metadata, deployment.id),
    message: BUILD_QUEUED_MESSAGE,
  }
}

function schedulePublishDeploymentArtifacts({
  claims,
  projectRef,
  deploymentId,
  files,
}: {
  claims: Claims
  projectRef: string
  deploymentId: string
  files: Record<string, string>
}) {
  void publishDeploymentArtifacts({
    claims,
    deploymentId,
    files,
    ref: projectRef,
  }).catch((error) => {
    console.warn(
      '[os-publish-ports] async artifact publish failed for %s / %s: %s',
      projectRef,
      deploymentId,
      error instanceof Error ? error.message : String(error),
    )
  })
}

async function publishPayloadArtifactsInline({
  claims,
  projectRef,
  files,
  contentHash,
}: {
  claims: Claims
  projectRef: string
  files: Record<string, string>
  contentHash: string
}): Promise<Extract<Awaited<ReturnType<BuildArtifactPort['build']>>, { ok: true }>> {
  const deployment = await createProjectDeployment({
    claims,
    ref: projectRef,
    requestedVia: 'api',
    skipInlineProcessing: true,
    metadata: {
      source: 'os_execution_publish',
      content_hash: contentHash,
      artifact_count: Object.keys(files).length,
    },
  })

  const { deployment: published, manifest } = await publishDeploymentArtifacts({
    claims,
    deploymentId: deployment.id,
    files,
    ref: projectRef,
  })

  const artifactRef = manifest.prefix || artifactRefFromMetadata(published.metadata, published.id)

  return {
    ok: true,
    status: 'ready',
    artifactRef,
    buildId: published.id,
    promoteSnapshot: {
      snapshotId: `deploy_${published.id}`,
      deploymentId: published.id,
      contentHash: contentHashFromMetadata(published.metadata) ?? contentHash,
      kind: 'artifact',
      artifactRef,
      source: 'ready_deployment',
    },
  }
}

export function createStudioCapabilityEnsurePort({
  claims,
}: {
  claims: Claims
}): CapabilityEnsurePort {
  return {
    async ensureCapabilities({ projectRef, capabilities }) {
      for (const capability of capabilities) {
        try {
          const result = await ensureOsCapability({
            claims,
            workspaceRef: projectRef,
            capability,
          })
          if (!result.ok) {
            return {
              ok: false,
              capability: result.capability,
              message:
                result.message && !looksInfra(result.message)
                  ? result.message
                  : 'We could not enable a required feature for your business yet. Please try again.',
            }
          }
        } catch {
          return {
            ok: false,
            capability,
            message: 'We could not enable a required feature for your business yet. Please try again.',
          }
        }
      }
      return { ok: true }
    },
  }
}

export function createStudioMarkLivePort({ claims }: { claims: Claims }): MarkLivePort {
  return {
    async markLive(input) {
      const gotrueId = getGotrueUserId(claims)
      const queued = input.publishStatus === 'queued'
      const osPublish = {
        execution_id: input.executionId,
        live_url: input.liveUrl,
        published_at: new Date().toISOString(),
        snapshot_id: input.snapshot?.snapshotId ?? null,
        content_hash: input.snapshot?.contentHash ?? null,
        artifact_ref: input.artifactRef ?? null,
        publish_status: input.publishStatus,
        kind: input.snapshot?.kind ?? 'hosting-only',
        freeze_source: input.snapshot?.source ?? null,
        resume_pending: queued,
        deployment_id: input.snapshot?.deploymentId ?? null,
      }

      await persistOsPublishOnProject({
        projectRef: input.projectRef,
        gotrueId,
        osPublish,
      })

      if (!input.snapshot?.deploymentId) {
        return
      }

      try {
        await updateProjectDeployment({
          deploymentId: input.snapshot.deploymentId,
          ref: input.projectRef,
          source: 'api',
          targetUrl: input.liveUrl,
          metadataPatch: {
            os_publish: osPublish,
            os_publish_resume: queued
              ? { pending: true, queued_at: new Date().toISOString() }
              : { pending: false },
          },
          logMessage:
            input.publishStatus === 'published'
              ? 'Business marked live via Indobase OS'
              : 'Launch queued via Indobase OS — will finish when the build is ready',
        })
      } catch {
        // Project-level os_publish already persisted — deployment row update is best-effort.
      }
    },
  }
}

async function persistOsPublishOnProject({
  projectRef,
  gotrueId,
  osPublish,
}: {
  projectRef: string
  gotrueId: string
  osPublish: Record<string, unknown>
}) {
  await ensureSaasTables()
  const result = await executeQuery({
    query: `
      update saas.projects p
      set auth_config = coalesce(p.auth_config, '{}'::jsonb) || jsonb_build_object('os_publish', $2::jsonb)
      where p.ref = $1
        and exists (
          select 1 from saas.organization_members m
          where m.organization_id = p.organization_id and m.gotrue_id = $3
        )
    `,
    parameters: [projectRef, JSON.stringify(osPublish), gotrueId],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
}

function looksInfra(message: string): boolean {
  const lower = message.toLowerCase()
  return ['docker', 'provisioner', 'traefik', 'swarm', '502', '503', 'compose', 'eai_again'].some(
    (t) => lower.includes(t),
  )
}
