import type { SnapshotId } from '../ids'
import { createExecutionId } from '../ids'
import type { PlatformEventBus } from '../events'
import { toPlatformEvent } from '../events'
import type { DeploymentContext } from './DeploymentAdapter'
import type { DeploymentAdapter } from './DeploymentAdapter'
import type { DeploymentResult } from './DeploymentResult'
import { deploymentFailed, deploymentSucceeded } from './DeploymentResult'
import {
  EXECUTION_PUBLISH_PIPELINE,
  ExecutionPipelineStage,
  type ExecutionPipelineStage as PipelineStage,
} from './ExecutionPipeline'
import type {
  BuildArtifactPort,
  CapabilityEnsurePort,
  FreezeSnapshotPort,
  FrozenPublishSnapshot,
  MarkLivePort,
} from './PublishPorts'
import type { PublishPreflightPort, PublishPreflightSuccess, PublishPipelineInput } from './PublishPreflight'

export type { PublishPipelineInput } from './PublishPreflight'
export type {
  BuildArtifactPort,
  CapabilityEnsurePort,
  FreezeSnapshotPort,
  FrozenPublishSnapshot,
  MarkLivePort,
} from './PublishPorts'

export type ExecutionOrchestratorOptions = {
  adapter: DeploymentAdapter
  preflight?: PublishPreflightPort
  freezeSnapshot?: FreezeSnapshotPort
  build?: BuildArtifactPort
  capabilityEnsure?: CapabilityEnsurePort
  markLive?: MarkLivePort
  /** In-process platform event bus — EmitEvents publishes here when provided. */
  eventBus?: PlatformEventBus
}

export class NotImplementedPipelineStageError extends Error {
  readonly stage: PipelineStage

  constructor(stage: PipelineStage) {
    super(`execution.publish pipeline stage not implemented: ${stage}`)
    this.name = 'NotImplementedPipelineStageError'
    this.stage = stage
  }
}

type PipelineRunState = {
  preflight?: PublishPreflightSuccess
  snapshot?: FrozenPublishSnapshot
  liveUrl?: string
  outputRef?: string
  buildId?: string
  /** True after adapter.deploy has been invoked successfully enough to warrant rollback. */
  deployStarted?: boolean
  /**
   * Build returned structured queued (in-progress deploy / async server-build).
   * Skip Deploy + HealthCheck; finish as publishStatus queued.
   */
  buildQueued?: boolean
  buildQueuedMessage?: string
}

type StageContext = PublishPipelineInput & {
  executionId: ReturnType<typeof createExecutionId>
  run: PipelineRunState
  startedAt: string
}

const CUSTOMER_SAFE = {
  snapshotFreeze: 'We could not prepare your launch snapshot. Please try again.',
  build: "Your site isn't ready to publish yet. Finish building, then try Launch again.",
  capability: 'We could not enable a required feature for your business yet. Please try again.',
  health: "We couldn't confirm your site is live yet. Please try again in a moment.",
  deploy: 'We could not publish your business right now. Please try again.',
} as const

/**
 * Runs execution.publish stages in order.
 * PR 3: FreezeSnapshot, Build, CapabilityEnsure, HealthCheck, MarkLive, EmitEvents, rollback.
 */
export class ExecutionOrchestrator {
  readonly adapter: DeploymentAdapter
  readonly preflight?: PublishPreflightPort
  readonly freezeSnapshotPort?: FreezeSnapshotPort
  readonly buildPort?: BuildArtifactPort
  readonly capabilityEnsurePort?: CapabilityEnsurePort
  readonly markLivePort?: MarkLivePort
  readonly eventBus?: PlatformEventBus

  constructor(options: ExecutionOrchestratorOptions) {
    this.adapter = options.adapter
    this.preflight = options.preflight
    this.freezeSnapshotPort = options.freezeSnapshot
    this.buildPort = options.build
    this.capabilityEnsurePort = options.capabilityEnsure
    this.markLivePort = options.markLive
    this.eventBus = options.eventBus
  }

  /** Ordered publish pipeline — delegates to stage handlers. */
  async runPublishPipeline(input: PublishPipelineInput): Promise<DeploymentResult> {
    const executionId = createExecutionId()
    const startedAt = new Date().toISOString()
    const run: PipelineRunState = {}
    const ctx: StageContext = { ...input, executionId, run, startedAt }

    for (const stage of EXECUTION_PUBLISH_PIPELINE) {
      try {
        const early = await this.runStage(stage, ctx)
        if (early) {
          return early
        }
      } catch (error) {
        await this.maybeRollback(ctx, stage, error)
        const message = this.customerSafeMessage(stage, error)
        const errorCode = this.errorCodeForStage(stage, error)
        return deploymentFailed({
          executionId,
          projectRef: input.projectRef,
          startedAt,
          finishedAt: new Date().toISOString(),
          stage,
          errorCode,
          message,
        })
      }
    }

    if (!run.liveUrl || !run.preflight) {
      return deploymentFailed({
        executionId,
        projectRef: input.projectRef,
        startedAt,
        finishedAt: new Date().toISOString(),
        stage: ExecutionPipelineStage.MarkLive,
        errorCode: 'UNKNOWN',
        message: 'We could not finish launching your business. Please try again.',
      })
    }

    const queued = !run.preflight.deployReady || Boolean(run.buildQueued)
    return deploymentSucceeded({
      executionId,
      projectRef: input.projectRef,
      startedAt,
      finishedAt: new Date().toISOString(),
      liveUrl: run.liveUrl,
      stage: ExecutionPipelineStage.EmitEvents,
      outputRef: run.outputRef,
      publishStatus: queued ? 'queued' : 'published',
      message: queued
        ? run.buildQueuedMessage || run.preflight.queuedMessage
        : undefined,
    })
  }

  /** @internal Stage handler — returns a terminal DeploymentResult when the pipeline should stop early. */
  protected async runStage(
    stage: PipelineStage,
    ctx: StageContext,
  ): Promise<DeploymentResult | void> {
    switch (stage) {
      case ExecutionPipelineStage.ValidateWorkspace:
        return this.runValidateWorkspace(ctx)
      case ExecutionPipelineStage.FreezeSnapshot:
        return this.runFreezeSnapshot(ctx)
      case ExecutionPipelineStage.Build:
        return this.runBuild(ctx)
      case ExecutionPipelineStage.CapabilityEnsure:
        return this.runCapabilityEnsure(ctx)
      case ExecutionPipelineStage.Deploy:
        return this.runDeploy(ctx)
      case ExecutionPipelineStage.AssignDomain:
        return this.runAssignDomain(ctx)
      case ExecutionPipelineStage.SSL:
        await this.adapter.provisionTLS(this.deploymentContext(ctx), ctx.run.preflight!.hostDomain)
        return
      case ExecutionPipelineStage.HealthCheck:
        return this.runHealthCheck(ctx)
      case ExecutionPipelineStage.MarkLive:
        return this.runMarkLive(ctx)
      case ExecutionPipelineStage.EmitEvents:
        return this.runEmitEvents(ctx)
      default:
        throw new NotImplementedPipelineStageError(stage)
    }
  }

  private async runValidateWorkspace(ctx: StageContext): Promise<DeploymentResult | void> {
    if (!this.preflight) {
      throw new Error('Publish preflight is required for ValidateWorkspace')
    }

    const result = await this.preflight.validateWorkspace(ctx)
    if (!result.ok) {
      return deploymentFailed({
        executionId: ctx.executionId,
        projectRef: ctx.projectRef,
        startedAt: ctx.startedAt,
        finishedAt: new Date().toISOString(),
        stage: ExecutionPipelineStage.ValidateWorkspace,
        errorCode: 'VALIDATION_FAILED',
        message: result.message,
      })
    }

    ctx.run.preflight = result
  }

  private async runFreezeSnapshot(ctx: StageContext): Promise<DeploymentResult | void> {
    const preflight = ctx.run.preflight
    if (!preflight) {
      throw new Error('FreezeSnapshot requires ValidateWorkspace preflight')
    }

    if (this.freezeSnapshotPort) {
      const result = await this.freezeSnapshotPort.freezeSnapshot({
        projectRef: ctx.projectRef,
        reason: ctx.reason,
        payload: ctx.payload,
        requiredCapabilities: ctx.requiredCapabilities,
        preflight,
      })
      if (!result.ok) {
        return deploymentFailed({
          executionId: ctx.executionId,
          projectRef: ctx.projectRef,
          startedAt: ctx.startedAt,
          finishedAt: new Date().toISOString(),
          stage: ExecutionPipelineStage.FreezeSnapshot,
          errorCode: 'SNAPSHOT_FREEZE_FAILED',
          message: result.message || CUSTOMER_SAFE.snapshotFreeze,
        })
      }
      ctx.run.snapshot = result.snapshot
      return
    }

    // Minimal durable reference when Studio port is not wired (tests / older callers).
    const explicit =
      typeof ctx.payload?.snapshotId === 'string'
        ? ctx.payload.snapshotId
        : typeof ctx.payload?.deploymentId === 'string'
          ? `deploy_${ctx.payload.deploymentId}`
          : undefined
    ctx.run.snapshot = {
      snapshotId: explicit ?? `hosting_${ctx.projectRef}`,
      kind: explicit ? 'artifact' : 'hosting-only',
      deploymentId:
        typeof ctx.payload?.deploymentId === 'string' ? ctx.payload.deploymentId : undefined,
      artifactRef: ctx.projectRef,
    }
  }

  private async runBuild(ctx: StageContext): Promise<DeploymentResult | void> {
    const snapshot = ctx.run.snapshot
    const preflight = ctx.run.preflight
    if (!snapshot || !preflight) {
      throw new Error('Build requires FreezeSnapshot')
    }

    if (this.buildPort) {
      const result = await this.buildPort.build({
        projectRef: ctx.projectRef,
        snapshot,
        deployReady: preflight.deployReady,
        payload: ctx.payload,
      })
      if (!result.ok) {
        return deploymentFailed({
          executionId: ctx.executionId,
          projectRef: ctx.projectRef,
          startedAt: ctx.startedAt,
          finishedAt: new Date().toISOString(),
          stage: ExecutionPipelineStage.Build,
          errorCode: 'BUILD_FAILED',
          message: result.message || CUSTOMER_SAFE.build,
        })
      }

      if (result.status === 'queued') {
        ctx.run.buildQueued = true
        ctx.run.buildQueuedMessage =
          result.message ||
          'Your site is still building. Launch will finish when the build is ready.'
        ctx.run.outputRef = result.artifactRef ?? snapshot.artifactRef ?? snapshot.snapshotId
        ctx.run.buildId = result.buildId
        // Stamp deployment id onto freeze so MarkLive can resume when ready.
        if (result.buildId) {
          ctx.run.snapshot = {
            ...snapshot,
            deploymentId: result.buildId,
            artifactRef: result.artifactRef ?? snapshot.artifactRef,
          }
        }
        return
      }

      ctx.run.outputRef = result.artifactRef
      ctx.run.buildId = result.buildId
      if (result.promoteSnapshot) {
        ctx.run.snapshot = {
          ...snapshot,
          ...result.promoteSnapshot,
          kind: result.promoteSnapshot.kind ?? 'artifact',
          artifactRef: result.promoteSnapshot.artifactRef ?? result.artifactRef,
          deploymentId: result.promoteSnapshot.deploymentId ?? result.buildId,
        }
      }
      return
    }

    ctx.run.outputRef = snapshot.artifactRef ?? snapshot.snapshotId
  }

  private async runCapabilityEnsure(ctx: StageContext): Promise<DeploymentResult | void> {
    const capabilities = normalizeRequiredCapabilities(
      ctx.requiredCapabilities,
      ctx.payload,
    )
    if (capabilities.length === 0) {
      return
    }

    if (!this.capabilityEnsurePort) {
      return deploymentFailed({
        executionId: ctx.executionId,
        projectRef: ctx.projectRef,
        startedAt: ctx.startedAt,
        finishedAt: new Date().toISOString(),
        stage: ExecutionPipelineStage.CapabilityEnsure,
        errorCode: 'CAPABILITY_ENSURE_FAILED',
        message: CUSTOMER_SAFE.capability,
      })
    }

    const result = await this.capabilityEnsurePort.ensureCapabilities({
      projectRef: ctx.projectRef,
      capabilities,
      payload: ctx.payload,
    })
    if (!result.ok) {
      return deploymentFailed({
        executionId: ctx.executionId,
        projectRef: ctx.projectRef,
        startedAt: ctx.startedAt,
        finishedAt: new Date().toISOString(),
        stage: ExecutionPipelineStage.CapabilityEnsure,
        errorCode: 'CAPABILITY_ENSURE_FAILED',
        message: result.message || CUSTOMER_SAFE.capability,
      })
    }
  }

  private async runDeploy(ctx: StageContext): Promise<void> {
    const preflight = ctx.run.preflight
    if (!preflight?.deployReady || ctx.run.buildQueued) {
      return
    }

    const deploymentCtx = this.deploymentContext(ctx)
    await this.adapter.prepare(deploymentCtx)
    ctx.run.deployStarted = true
    const artifact = await this.adapter.deploy(deploymentCtx)
    if (artifact.artifactRef) {
      ctx.run.outputRef = artifact.artifactRef
    }
  }

  private async runAssignDomain(ctx: StageContext): Promise<void> {
    const preflight = ctx.run.preflight
    if (!preflight) {
      throw new Error('AssignDomain requires ValidateWorkspace preflight')
    }

    const assignment = await this.adapter.assignDomain(
      this.deploymentContext(ctx),
      preflight.hostDomain,
    )
    ctx.run.liveUrl = assignment.liveUrl
  }

  private async runHealthCheck(ctx: StageContext): Promise<DeploymentResult | void> {
    if (!ctx.run.preflight?.deployReady || !ctx.run.liveUrl || ctx.run.buildQueued) {
      return
    }

    // Hosting-only launches may have no index yet — skip hard probe (documented gap).
    if (ctx.run.snapshot?.kind === 'hosting-only') {
      return
    }

    const probe = await this.adapter.healthCheck(this.deploymentContext(ctx), ctx.run.liveUrl)
    if (!probe.healthy) {
      const detail =
        typeof probe.details?.message === 'string' ? probe.details.message : CUSTOMER_SAFE.health
      throw Object.assign(new Error(detail), { __healthFailed: true })
    }
  }

  private async runMarkLive(ctx: StageContext): Promise<void> {
    if (!this.markLivePort || !ctx.run.liveUrl || !ctx.run.preflight) {
      return
    }

    const queued = !ctx.run.preflight.deployReady || Boolean(ctx.run.buildQueued)
    try {
      await this.markLivePort.markLive({
        projectRef: ctx.projectRef,
        liveUrl: ctx.run.liveUrl,
        executionId: ctx.executionId,
        snapshot: ctx.run.snapshot,
        artifactRef: ctx.run.outputRef,
        publishStatus: queued ? 'queued' : 'published',
      })
    } catch {
      // Durable mark is best-effort — do not fail a healthy publish.
    }
  }

  private async runEmitEvents(ctx: StageContext): Promise<void> {
    if (!this.eventBus || !ctx.run.liveUrl) {
      return
    }

    try {
      const at = Date.now()
      const snapshotId = (ctx.run.snapshot?.snapshotId ??
        `hosting_${ctx.projectRef}`) as SnapshotId
      const published = toPlatformEvent(
        {
          type: 'DeploymentPublished',
          snapshotId,
          ...(ctx.run.buildId ? { buildId: ctx.run.buildId as never } : {}),
          deployRef: ctx.run.outputRef ?? ctx.run.liveUrl,
          at,
        },
        { projectRef: ctx.projectRef, correlationId: ctx.executionId },
      )
      this.eventBus.publish(published)

      const finished = toPlatformEvent(
        {
          type: 'ExecutionFinished',
          executionId: ctx.executionId,
          kind: 'execution.publish',
          ok: true,
          outputRef: ctx.run.outputRef ?? ctx.run.liveUrl,
          at,
        },
        { projectRef: ctx.projectRef, correlationId: ctx.executionId },
      )
      this.eventBus.publish(finished)
      // Queued launches (preflight or build) still emit; DeploymentPublished marks the reserved URL.
    } catch {
      // Event emission is fire-and-forget.
    }
  }

  private async maybeRollback(
    ctx: StageContext,
    stage: PipelineStage,
    error: unknown,
  ): Promise<void> {
    const shouldRollback =
      ctx.run.deployStarted &&
      (stage === ExecutionPipelineStage.Deploy ||
        stage === ExecutionPipelineStage.AssignDomain ||
        stage === ExecutionPipelineStage.SSL ||
        stage === ExecutionPipelineStage.HealthCheck)

    if (!shouldRollback) {
      return
    }

    const reason =
      error instanceof Error ? error.message : 'execution.publish pipeline failure after deploy'
    try {
      await this.adapter.rollback(this.deploymentContext(ctx), reason)
    } catch {
      // Best-effort — do not mask the original stage failure.
    }
  }

  private deploymentContext(ctx: StageContext): DeploymentContext {
    return {
      executionId: ctx.executionId,
      projectRef: ctx.projectRef,
      snapshotId: ctx.run.snapshot?.snapshotId as SnapshotId | undefined,
      payload: {
        ...ctx.payload,
        deploymentId: ctx.run.snapshot?.deploymentId,
        frozenKind: ctx.run.snapshot?.kind,
        contentHash: ctx.run.snapshot?.contentHash,
        artifactRef: ctx.run.outputRef ?? ctx.run.snapshot?.artifactRef,
      },
    }
  }

  private customerSafeMessage(stage: PipelineStage, error: unknown): string {
    const raw = error instanceof Error ? error.message : ''
    if (looksCustomerSafe(raw)) {
      return raw
    }
    switch (stage) {
      case ExecutionPipelineStage.FreezeSnapshot:
        return CUSTOMER_SAFE.snapshotFreeze
      case ExecutionPipelineStage.Build:
        return CUSTOMER_SAFE.build
      case ExecutionPipelineStage.CapabilityEnsure:
        return CUSTOMER_SAFE.capability
      case ExecutionPipelineStage.HealthCheck:
        return CUSTOMER_SAFE.health
      case ExecutionPipelineStage.Deploy:
        return CUSTOMER_SAFE.deploy
      default:
        return raw || 'We could not finish launching your business. Please try again.'
    }
  }

  private errorCodeForStage(
    stage: PipelineStage,
    error: unknown,
  ): import('./DeploymentResult').DeploymentErrorCode {
    if (error instanceof NotImplementedPipelineStageError) {
      return 'NOT_IMPLEMENTED'
    }
    switch (stage) {
      case ExecutionPipelineStage.ValidateWorkspace:
        return 'VALIDATION_FAILED'
      case ExecutionPipelineStage.FreezeSnapshot:
        return 'SNAPSHOT_FREEZE_FAILED'
      case ExecutionPipelineStage.Build:
        return 'BUILD_FAILED'
      case ExecutionPipelineStage.CapabilityEnsure:
        return 'CAPABILITY_ENSURE_FAILED'
      case ExecutionPipelineStage.Deploy:
        return 'DEPLOY_FAILED'
      case ExecutionPipelineStage.AssignDomain:
        return 'DOMAIN_ASSIGN_FAILED'
      case ExecutionPipelineStage.SSL:
        return 'TLS_FAILED'
      case ExecutionPipelineStage.HealthCheck:
        return 'HEALTH_CHECK_FAILED'
      default:
        return 'UNKNOWN'
    }
  }
}

function normalizeRequiredCapabilities(
  required?: string[],
  payload?: Record<string, unknown>,
): string[] {
  const fromInput = Array.isArray(required) ? required : []
  const fromPayload = Array.isArray(payload?.requiredCapabilities)
    ? payload.requiredCapabilities
    : Array.isArray(payload?.required_capabilities)
      ? payload.required_capabilities
      : []
  const merged = [...fromInput, ...fromPayload]
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of merged) {
    if (typeof raw !== 'string') continue
    const key = raw.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function looksCustomerSafe(message: string): boolean {
  if (!message.trim()) return false
  const lower = message.toLowerCase()
  const infra = [
    'docker',
    'swarm',
    'traefik',
    'provisioner',
    'eai_again',
    'enotfound',
    'status code',
    '502',
    '503',
    'internal server',
    'stack',
    'compose',
  ]
  return !infra.some((token) => lower.includes(token))
}
