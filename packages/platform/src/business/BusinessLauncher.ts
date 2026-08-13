import type { PlatformEventBus } from '../events'
import { toPlatformEvent } from '../events'
import type { ExecutionPublisher } from '../execution/ExecutionPublisher'
import type { DeploymentResult } from '../execution/DeploymentResult'
import {
  BUSINESS_LAUNCH_PIPELINE,
  BusinessLaunchStage,
  type BusinessLaunchStage as LaunchStage,
} from './BusinessLaunchPipeline'
import {
  BUSINESS_FAILED_MESSAGE,
  BUSINESS_LIVE_MESSAGE,
  BUSINESS_QUEUED_MESSAGE,
  BUSINESS_VERIFY_FAILED_MESSAGE,
  businessLaunchFailed,
  businessLaunchSucceeded,
  type BusinessLaunchResult,
} from './BusinessLaunchResult'
import {
  createNoopBusinessLaunchPorts,
  type BusinessConfigurePort,
  type BusinessEnsureCapabilitiesPort,
  type BusinessLaunchInput,
  type BusinessOperatorPort,
  type BusinessPlannerPort,
  type BusinessVerifyPort,
} from './BusinessLaunchPorts'

/**
 * Public entry for business.launch — OS Launch verb.
 * Internally calls execution.publish for the deploy substrate; customer copy stays business-live.
 */

export type BusinessLauncherOptions = {
  executionPublisher: ExecutionPublisher
  planner?: BusinessPlannerPort
  ensureCapabilities?: BusinessEnsureCapabilitiesPort
  configure?: BusinessConfigurePort
  verify?: BusinessVerifyPort
  operator?: BusinessOperatorPort
  /** Optional bus for BusinessLive / launch-finished events after Publish. */
  eventBus?: PlatformEventBus
}

export interface BusinessLauncher {
  launch(input: BusinessLaunchInput): Promise<BusinessLaunchResult>
}

type LaunchRunState = {
  liveUrl?: string
  publishStatus?: 'queued' | 'published'
  executionId?: string
  publishMessage?: string
  deployment?: DeploymentResult
  /** True when Verify hard-failed — MarkBusinessLive / EmitEvents skipped. */
  verifyFailed?: boolean
}

type StageContext = BusinessLaunchInput & {
  run: LaunchRunState
}

export class DefaultBusinessLauncher implements BusinessLauncher {
  readonly executionPublisher: ExecutionPublisher
  readonly planner: BusinessPlannerPort
  readonly ensureCapabilitiesPort: BusinessEnsureCapabilitiesPort
  readonly configurePort: BusinessConfigurePort
  readonly verifyPort: BusinessVerifyPort
  readonly operatorPort: BusinessOperatorPort
  readonly eventBus?: PlatformEventBus

  constructor(options: BusinessLauncherOptions) {
    const stubs = createNoopBusinessLaunchPorts()
    this.executionPublisher = options.executionPublisher
    this.planner = options.planner ?? stubs.planner
    this.ensureCapabilitiesPort = options.ensureCapabilities ?? stubs.ensureCapabilities
    this.configurePort = options.configure ?? stubs.configure
    this.verifyPort = options.verify ?? stubs.verify
    this.operatorPort = options.operator ?? stubs.operator
    this.eventBus = options.eventBus
  }

  async launch(input: BusinessLaunchInput): Promise<BusinessLaunchResult> {
    const ctx: StageContext = { ...input, run: {} }

    for (const stage of BUSINESS_LAUNCH_PIPELINE) {
      const early = await this.runStage(stage, ctx)
      if (early) return early
    }

    const liveUrl = ctx.run.liveUrl
    if (!liveUrl) {
      return businessLaunchFailed({
        stage: BusinessLaunchStage.MarkBusinessLive,
        errorCode: 'PUBLISH_FAILED',
        message: BUSINESS_FAILED_MESSAGE,
        executionId: ctx.run.executionId,
      })
    }

    const queued = ctx.run.publishStatus === 'queued'
    return businessLaunchSucceeded({
      liveUrl,
      status: queued ? 'queued' : 'live',
      stage: BusinessLaunchStage.EmitEvents,
      executionId: ctx.run.executionId,
      message: queued
        ? (ctx.run.publishMessage ?? BUSINESS_QUEUED_MESSAGE)
        : BUSINESS_LIVE_MESSAGE,
    })
  }

  protected async runStage(
    stage: LaunchStage,
    ctx: StageContext,
  ): Promise<BusinessLaunchResult | void> {
    switch (stage) {
      case BusinessLaunchStage.Plan:
        return this.runPlan(ctx)
      case BusinessLaunchStage.EnsureCapabilities:
        return this.runEnsureCapabilities(ctx)
      case BusinessLaunchStage.Publish:
        return this.runPublish(ctx)
      case BusinessLaunchStage.ConfigureBusiness:
        return this.runConfigure(ctx)
      case BusinessLaunchStage.Verify:
        return this.runVerify(ctx)
      case BusinessLaunchStage.StartOperator:
        return this.runOperator(ctx)
      case BusinessLaunchStage.MarkBusinessLive:
        // Claim skipped when Verify hard-failed (execution MarkLive may already
        // have reserved hosting; Studio stamps os_publish verify_failed).
        if (ctx.run.verifyFailed) {
          return businessLaunchFailed({
            stage: BusinessLaunchStage.MarkBusinessLive,
            errorCode: 'VERIFY_FAILED',
            message: ctx.run.publishMessage || BUSINESS_VERIFY_FAILED_MESSAGE,
            executionId: ctx.run.executionId,
            liveUrl: ctx.run.liveUrl,
          })
        }
        return
      case BusinessLaunchStage.EmitEvents:
        return this.runEmitEvents(ctx)
      default: {
        const _exhaustive: never = stage
        return _exhaustive
      }
    }
  }

  private async runPlan(ctx: StageContext): Promise<BusinessLaunchResult | void> {
    const result = await this.planner.plan(ctx)
    if (!result.ok) {
      return businessLaunchFailed({
        stage: BusinessLaunchStage.Plan,
        errorCode: 'PLAN_FAILED',
        message: result.message || BUSINESS_FAILED_MESSAGE,
      })
    }

    // Apply auto-detected capabilities when caller omitted requiredCapabilities.
    // Explicit [] stays hosting-only; explicit non-empty lists are never overwritten.
    if (result.plan) {
      ctx.payload = {
        ...(ctx.payload ?? {}),
        launch_planner: result.plan,
      }
      if (ctx.requiredCapabilities === undefined) {
        const caps = result.plan.requiredCapabilities
        if (Array.isArray(caps)) {
          ctx.requiredCapabilities = caps.filter(
            (c): c is string => typeof c === 'string' && c.trim().length > 0,
          )
        }
      }
    }
  }

  private async runEnsureCapabilities(
    ctx: StageContext,
  ): Promise<BusinessLaunchResult | void> {
    const capabilities = ctx.requiredCapabilities ?? []
    // Static / hosting-only Launch (requiredCapabilities: []) must not touch
    // the hidden data engine. Capability lane only when login/data/payments
    // were asked for — see resolveLaunchLane / adr/0008.
    if (capabilities.length === 0) return

    const result = await this.ensureCapabilitiesPort.ensureCapabilities({
      workspaceRef: ctx.workspaceRef,
      capabilities,
      payload: ctx.payload,
    })
    if (!result.ok) {
      return businessLaunchFailed({
        stage: BusinessLaunchStage.EnsureCapabilities,
        errorCode: 'CAPABILITY_ENSURE_FAILED',
        message: result.message || BUSINESS_FAILED_MESSAGE,
      })
    }
  }

  private async runPublish(ctx: StageContext): Promise<BusinessLaunchResult | void> {
    const deployment = await this.executionPublisher.publish({
      projectRef: ctx.workspaceRef,
      reason: ctx.reason ?? 'os_launch',
      requiredCapabilities: ctx.requiredCapabilities,
      payload: ctx.payload,
    })

    ctx.run.deployment = deployment
    ctx.run.executionId = deployment.executionId

    if (!deployment.outcome.ok) {
      return businessLaunchFailed({
        stage: BusinessLaunchStage.Publish,
        errorCode: 'PUBLISH_FAILED',
        message: deployment.outcome.message || BUSINESS_FAILED_MESSAGE,
        executionId: deployment.executionId,
      })
    }

    ctx.run.liveUrl = deployment.outcome.liveUrl
    ctx.run.publishStatus = deployment.outcome.publishStatus ?? 'published'
    ctx.run.publishMessage = deployment.outcome.message
  }

  private async runConfigure(ctx: StageContext): Promise<BusinessLaunchResult | void> {
    if (!ctx.run.liveUrl || ctx.run.publishStatus === 'queued') return

    try {
      const result = await this.configurePort.configure({
        workspaceRef: ctx.workspaceRef,
        liveUrl: ctx.run.liveUrl,
        requiredCapabilities: ctx.requiredCapabilities,
        payload: ctx.payload,
      })
      // Best-effort after Publish: site is already live — do not fail Launch on configure.
      if (!result.ok) {
        ctx.run.publishMessage = ctx.run.publishMessage ?? result.message
      }
    } catch {
      // Configure port must not break business.launch.
    }
  }

  private async runVerify(ctx: StageContext): Promise<BusinessLaunchResult | void> {
    if (!ctx.run.liveUrl || ctx.run.publishStatus === 'queued') return

    // Pass through only when explicit — Studio resolveStrictVerify owns
    // hosting-only soft / env / artifact defaults (do not force true here).
    const strictVerify = resolveLaunchStrictVerify(ctx)

    try {
      const result = await this.verifyPort.verify({
        workspaceRef: ctx.workspaceRef,
        liveUrl: ctx.run.liveUrl,
        requiredCapabilities: ctx.requiredCapabilities,
        ...(typeof strictVerify === 'boolean' ? { strictVerify } : {}),
        payload: ctx.payload,
      })
      if (!result.ok) {
        // Hard verify failure after Publish: do not claim business fully live.
        // Hosting is not torn down — Studio stamps os_publish verify_failed.
        ctx.run.verifyFailed = true
        ctx.run.publishMessage = result.message || BUSINESS_VERIFY_FAILED_MESSAGE
        return businessLaunchFailed({
          stage: BusinessLaunchStage.Verify,
          errorCode: 'VERIFY_FAILED',
          message: ctx.run.publishMessage,
          executionId: ctx.run.executionId,
          liveUrl: ctx.run.liveUrl,
        })
      }
    } catch {
      // Unexpected verify throw: do not fail Launch (flake / port bug). Soft path only.
    }
  }

  private async runOperator(ctx: StageContext): Promise<BusinessLaunchResult | void> {
    if (!ctx.run.liveUrl || ctx.run.publishStatus === 'queued') return

    try {
      await this.operatorPort.startOperator({
        workspaceRef: ctx.workspaceRef,
        liveUrl: ctx.run.liveUrl,
        requiredCapabilities: ctx.requiredCapabilities,
        payload: ctx.payload,
      })
      // Best-effort after Publish — operator persist failures must not fail Launch.
    } catch {
      // Operator port must not break business.launch.
    }
  }

  private async runEmitEvents(ctx: StageContext): Promise<void> {
    if (!this.eventBus || !ctx.run.liveUrl) return

    try {
      // DeploymentPublished already emitted by execution.publish — OS marks business.launch only.
      const finished = toPlatformEvent(
        {
          type: 'ExecutionFinished',
          executionId: ctx.run.executionId ?? `business_${ctx.workspaceRef}`,
          kind: 'business.launch',
          ok: true,
          outputRef: ctx.run.liveUrl,
          at: Date.now(),
        },
        {
          projectRef: ctx.workspaceRef,
          correlationId: ctx.run.executionId,
        },
      )
      this.eventBus.publish(finished)
    } catch {
      // Event emission is fire-and-forget.
    }
  }
}

/**
 * Resolve explicit strict homepage verify for this Launch.
 * Returns undefined when unset so Studio `resolveStrictVerify` can apply
 * hosting-only soft / env / artifact defaults.
 */
export function resolveLaunchStrictVerify(input: {
  strictVerify?: boolean
  payload?: Record<string, unknown>
}): boolean | undefined {
  if (typeof input.strictVerify === 'boolean') return input.strictVerify
  const fromPayload = input.payload?.strictVerify
  if (typeof fromPayload === 'boolean') return fromPayload
  return undefined
}

export function createBusinessLauncher(options: BusinessLauncherOptions): BusinessLauncher {
  return new DefaultBusinessLauncher(options)
}
