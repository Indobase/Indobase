import {
  getBusinessSpec,
  inferBusinessSpec,
  inferName,
  isPlaceholderBusinessName,
  mergeBusinessSpec,
  pickBusinessName,
  rememberBusinessSpec,
} from '../business-spec.js'
import {
  executeProductionLaunchJob,
  type ProductionLaunchExecuteResult,
} from '../../production-launch/index.js'
import { appendRuntimeEvent, getWorkspaceRuntime, issueRuntimeCommand } from '../runtime-store.js'
import { PLAN_COMMAND, PLAN_STEP, stepSucceeded, type ExecutionPlan } from '../execution-plan.js'
import { dependenciesSatisfied, getExecutionPlan, markStepStatus } from '../execution-store.js'
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
  const inferred = inferBusinessSpec(message)
  const spec = rememberBusinessSpec(
    session.projectRef,
    mergeBusinessSpec(runtime.spec || getBusinessSpec(session.projectRef), {
      businessName:
        pickBusinessName(
          runtime.spec?.businessName,
          getBusinessSpec(session.projectRef)?.businessName,
          inferred.businessName,
          inferName(message),
        ) || inferred.businessName,
      sourceIntent: runtime.spec?.sourceIntent || inferred.sourceIntent || message,
    }),
  )
  const command = issueRuntimeCommand(session.projectRef, 'runtime.launch', {
    appType: spec.businessType,
    vertical: spec.catalog.verticalId,
  })
  markStepStatus(livePlan, PLAN_STEP.productionLaunch, 'running')
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
  } else {
    markStepStatus(livePlan, PLAN_STEP.productionLaunch, 'failed', { error: launch.message })
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
