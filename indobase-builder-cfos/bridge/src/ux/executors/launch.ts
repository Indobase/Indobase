import {
  getBusinessSpec,
  isPlaceholderBusinessName,
  rememberBusinessSpec,
} from '../business-spec.js'
import {
  executeProductionLaunchJob,
  getLatestProductionLaunchJob,
  type ProductionLaunchExecuteResult,
} from '../../production-launch/index.js'
import { appendRuntimeEvent, getWorkspaceRuntime, issueRuntimeCommand } from '../runtime-store.js'
import { PLAN_COMMAND, PLAN_STEP, stepSucceeded, type ExecutionPlan } from '../execution-plan.js'
import { dependenciesSatisfied, getExecutionPlan, markStepStatus } from '../execution-store.js'
import { evaluatePreviewHealth } from '../preview-health.js'
import { currentArtifact, markArtifactLive } from '../artifact-store.js'
import { patchApplicationLifecycle } from '../lifecycle-store.js'
import { bindHostToProject, deterministicHostForProject } from '../host-binding-store.js'
import { rememberLiveClaim } from '../live-claim-store.js'
import { assertCanClaimLive } from '../../../../../packages/platform/src/business/live-claim.ts'
import { runBuild } from './build.js'
import type { ExecutorContext, ExecutorResult } from './types.js'

function currentPlan(plan: ExecutionPlan): ExecutionPlan {
  return getExecutionPlan(plan.operationId, plan.projectRef) || plan
}

export async function runLaunch(plan: ExecutionPlan, ctx: ExecutorContext): Promise<ExecutorResult> {
  const { session } = ctx
  let runtime = ctx.runtime
  let recovered = false
  let commandId = plan.commandId
  let livePlan = currentPlan(plan)

  const alreadyLive = getLatestProductionLaunchJob(session.projectRef)
  if (alreadyLive?.status === 'live' && alreadyLive.url && alreadyLive.claim_live) {
    if (!stepSucceeded(livePlan, PLAN_STEP.productionLaunch)) {
      markStepStatus(livePlan, PLAN_STEP.productionLaunch, 'succeeded', { resultRef: alreadyLive.jobId })
    }
    return {
      plan: currentPlan(livePlan),
      spec: runtime.spec,
      launch: {
        ok: true,
        job: alreadyLive,
        url: alreadyLive.url,
        claim_live: true,
        message: 'already live',
      } as ProductionLaunchExecuteResult,
      runtime: getWorkspaceRuntime(session.projectRef) || runtime,
      recovered,
      commandId,
    }
  }

  const previewReady = runtime.preview.status === 'ready' && Boolean(runtime.artifactHtml)
  const needsBuild =
    !previewReady ||
    !runtime.spec ||
    isPlaceholderBusinessName(runtime.spec.businessName) ||
    !stepSucceeded(livePlan, PLAN_STEP.preview)

  if (needsBuild && !stepSucceeded(livePlan, PLAN_STEP.preview)) {
    const built = await runBuild(livePlan, { ...ctx, runtime })
    runtime = built.runtime
    recovered = recovered || built.recovered
    commandId = built.commandId || commandId
    livePlan = currentPlan(livePlan)
  } else if (previewReady && !stepSucceeded(livePlan, PLAN_STEP.preview)) {
    if (livePlan.steps.some((s) => s.stepId === PLAN_STEP.create) && !stepSucceeded(livePlan, PLAN_STEP.create)) {
      markStepStatus(livePlan, PLAN_STEP.create, 'succeeded', { resultRef: 'reused' })
    }
    markStepStatus(livePlan, PLAN_STEP.preview, 'succeeded', {
      resultRef: runtime.preview.artifactRef || 'artifact',
    })
    livePlan = currentPlan(livePlan)
  }

  const launchStep = livePlan.steps.find((s) => s.command === PLAN_COMMAND.productionLaunch)
  if (!launchStep) {
    return {
      plan: livePlan,
      spec: runtime.spec,
      launch: null,
      runtime: getWorkspaceRuntime(session.projectRef) || runtime,
      recovered,
      commandId,
    }
  }

  livePlan = currentPlan(livePlan)
  if (!dependenciesSatisfied(livePlan, launchStep)) {
    markStepStatus(livePlan, PLAN_STEP.productionLaunch, 'failed', {
      error: 'executeProductionLaunchJob blocked: BUILD preview/artifact step has not succeeded',
    })
    return {
      plan: currentPlan(livePlan),
      spec: runtime.spec,
      launch: null,
      runtime: getWorkspaceRuntime(session.projectRef) || runtime,
      recovered,
      commandId,
    }
  }

  patchApplicationLifecycle(session.projectRef, 'verifying')
  const health = await evaluatePreviewHealth({
    projectRef: session.projectRef,
    httpStatus: runtime.preview.httpOk === false ? 503 : 200,
    html: runtime.artifactHtml,
    purpose: 'production',
    probes: ctx.launchDeps?.probes,
    ecommerceProbes: ctx.launchDeps?.ecommerceProbes,
    saasProbes: ctx.launchDeps?.saasProbes,
  })
  if (health.status !== 'ready' || !health.productionPassed) {
    patchApplicationLifecycle(session.projectRef, 'failed', {
      lastError: { code: 'preview_verification_failed', message: health.errors.join('; ') || 'preview verification failed', stage: 'verify' },
    })
    markStepStatus(livePlan, PLAN_STEP.productionLaunch, 'failed', {
      error: health.errors.join('; ') || 'preview verification failed',
    })
    return {
      plan: currentPlan(livePlan),
      spec: runtime.spec,
      launch: null,
      runtime: getWorkspaceRuntime(session.projectRef) || runtime,
      recovered,
      commandId,
    }
  }

  patchApplicationLifecycle(session.projectRef, 'verified', {
    artifactHash: health.artifactHash || runtime.preview.contentHash || undefined,
    artifactId: currentArtifact(session.projectRef)?.artifactId,
  })

  if (stepSucceeded(livePlan, PLAN_STEP.productionLaunch)) {
    return {
      plan: livePlan,
      spec: runtime.spec,
      runtime: getWorkspaceRuntime(session.projectRef) || runtime,
      recovered,
      commandId,
    }
  }

  const message = ctx.specSource || ctx.message
  const spec = runtime.spec || getBusinessSpec(session.projectRef)
  if (!spec) {
    markStepStatus(livePlan, PLAN_STEP.productionLaunch, 'failed', { error: 'BusinessSpec is required before launch' })
    return {
      plan: currentPlan(livePlan),
      spec: null,
      launch: null,
      runtime: getWorkspaceRuntime(session.projectRef) || runtime,
      recovered,
      commandId,
    }
  }
  rememberBusinessSpec(session.projectRef, spec)
  const command = issueRuntimeCommand(session.projectRef, 'runtime.launch', {
    appType: spec.businessType,
    vertical: spec.catalog.verticalId,
  })
  markStepStatus(livePlan, PLAN_STEP.productionLaunch, 'running')
  patchApplicationLifecycle(session.projectRef, 'launching')
  const verified = currentArtifact(session.projectRef)
  const host = deterministicHostForProject(session.projectRef)
  bindHostToProject({ host, projectRef: session.projectRef, artifactId: verified?.artifactId })
  let launch: ProductionLaunchExecuteResult = await executeProductionLaunchJob(
    session,
    {
      intent: spec.sourceIntent || message,
      appType: spec.businessType,
      production: true,
      html: runtime.artifactHtml || runtime.artifactFiles?.['index.html'] || null,
      files: runtime.artifactFiles || null,
      title: isPlaceholderBusinessName(spec.businessName) ? undefined : spec.businessName,
      brand: isPlaceholderBusinessName(spec.businessName) ? undefined : spec.businessName,
      vertical: spec.catalog.verticalId,
      verifiedArtifactId: verified?.artifactId,
      verifiedArtifactHash: verified?.artifactHash || runtime.preview.contentHash,
      subdomain: host.split('.')[0],
    },
    ctx.launchDeps,
  )
  appendRuntimeEvent(session.projectRef, {
    kind: launch.ok ? 'runtime.launch.live' : 'runtime.launch.failed',
    message: launch.message,
    commandId: command.id,
  })
  if (!launch.ok && launch.job.status === 'blocked' && launch.job.repairAttempts < 3) {
    launch = await executeProductionLaunchJob(
      session,
      {
        jobId: launch.job.jobId,
        intent: spec.sourceIntent || message,
        appType: spec.businessType,
        production: true,
        html: runtime.artifactHtml || null,
        files: runtime.artifactFiles || null,
        title: spec.businessName,
        brand: spec.businessName,
        vertical: spec.catalog.verticalId,
        verifiedArtifactId: verified?.artifactId,
        verifiedArtifactHash: verified?.artifactHash || runtime.preview.contentHash,
      },
      ctx.launchDeps,
    )
    appendRuntimeEvent(session.projectRef, {
      kind: launch.ok ? 'runtime.launch.retry.live' : 'runtime.launch.retry.failed',
      message: launch.message,
      commandId: command.id,
    })
  }
  if (launch.ok) {
    markStepStatus(livePlan, PLAN_STEP.productionLaunch, 'succeeded', { resultRef: launch.job.jobId })
    if (verified) markArtifactLive(session.projectRef, verified.artifactId)
    const hash = verified?.artifactHash || launch.job.publishedArtifactHash || launch.job.frozenArtifactHash
    patchApplicationLifecycle(session.projectRef, 'live', {
      liveUrl: launch.url,
      liveArtifactHash: hash,
    })
    const issued = assertCanClaimLive({
      projectRef: session.projectRef,
      lifecycleState: 'live',
      verifiedArtifactId: verified?.artifactId,
      verifiedArtifactHash: hash,
      deployedArtifactId: verified?.artifactId,
      deployedArtifactHash: hash,
      liveUrl: launch.url || null,
      liveHttpOk: launch.claim_live === true,
      smokeOk: launch.claim_live === true,
      deploymentId: launch.job.jobId,
      smokeTestId: `smoke_${launch.job.jobId}`,
    })
    if (issued.ok) rememberLiveClaim(issued.claim)
  } else {
    markStepStatus(livePlan, PLAN_STEP.productionLaunch, 'failed', { error: launch.message })
    patchApplicationLifecycle(session.projectRef, 'failed', {
      lastError: { code: launch.code || 'launch_failed', message: launch.message, stage: 'launch' },
    })
  }
  return {
    plan: currentPlan(livePlan),
    spec,
    launch,
    runtime: getWorkspaceRuntime(session.projectRef) || runtime,
    recovered,
    commandId: command.id,
  }
}
