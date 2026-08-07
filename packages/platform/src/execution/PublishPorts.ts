/**
 * Optional Studio/product ports for execution.publish PR 3+ stages.
 * Kernel orchestrator calls these; implementations wrap existing SaaS tables / Ensurer.
 */

import type { PublishPipelineInput, PublishPreflightSuccess } from './PublishPreflight'

/** Where a freeze came from — never mutable live editor state. */
export type FreezeSnapshotSource =
  | 'ready_deployment'
  | 'payload_artifacts'
  | 'in_progress_deployment'
  | 'hosting_placeholder'

/**
 * Durable publish freeze.
 * Prefer immutable ready deployment / content-addressed payload artifacts.
 * `hosting-only` is the documented gap when no publishable artifact exists yet.
 */
export type FrozenPublishSnapshot = {
  /** Durable id — deploy_<uuid>, payload_<hash>, or hosting_<ref>_<ts> */
  snapshotId: string
  /** Content fingerprint from artifact metadata or payload file digest */
  contentHash?: string
  /** saas.project_deployments id when freezing from a deployment row */
  deploymentId?: string
  /**
   * `artifact` = ready deployment / content-addressed payload / hosting_artifacts reference.
   * `hosting-only` = no Builder artifact yet; Launch still reserves hosting (PR 2 UX).
   */
  kind: 'artifact' | 'hosting-only'
  artifactRef?: string
  /** Provenance — never live editor workspace tree */
  source?: FreezeSnapshotSource
}

export type FreezeSnapshotResult =
  | { ok: true; snapshot: FrozenPublishSnapshot }
  | { ok: false; message: string }

export interface FreezeSnapshotPort {
  freezeSnapshot(
    input: PublishPipelineInput & { preflight: PublishPreflightSuccess },
  ): Promise<FreezeSnapshotResult>
}

/**
 * Build stage outcome.
 * - ready: artifact ref resolved or published in-request
 * - queued: build inputs exist but server-build / active deploy cannot finish synchronously
 */
export type BuildArtifactResult =
  | {
      ok: true
      status?: 'ready'
      artifactRef: string
      buildId?: string
      /** Promote freeze to artifact after inline publish (health probe eligible). */
      promoteSnapshot?: Partial<FrozenPublishSnapshot>
    }
  | {
      ok: true
      status: 'queued'
      artifactRef?: string
      buildId?: string
      message: string
    }
  | { ok: false; message: string }

export interface BuildArtifactPort {
  build(input: {
    projectRef: string
    snapshot: FrozenPublishSnapshot
    deployReady: boolean
    payload?: Record<string, unknown>
  }): Promise<BuildArtifactResult>
}

export type CapabilityEnsureResult =
  | { ok: true }
  | { ok: false; message: string; capability?: string }

export interface CapabilityEnsurePort {
  ensureCapabilities(input: {
    projectRef: string
    capabilities: string[]
    payload?: Record<string, unknown>
  }): Promise<CapabilityEnsureResult>
}

export interface MarkLivePort {
  markLive(input: {
    projectRef: string
    liveUrl: string
    executionId: string
    snapshot?: FrozenPublishSnapshot
    artifactRef?: string
    publishStatus: 'queued' | 'published'
  }): Promise<void>
}
