import {
  getBusinessSpec,
  inferBusinessSpec,
  inferName,
  isPlaceholderBusinessName,
  mergeBusinessSpec,
  pickBusinessName,
  rememberBusinessSpec,
  sealBusinessSpec,
  specIdentityFingerprint,
  type BusinessSpec,
} from '../business-spec.js'
import { getLatestProductionLaunchJob, productionJobMatchesSpec } from '../../production-launch/index.js'
import { flattenSafeFiles, isViteReactProject } from '../../production-launch/react-project.js'
import { materializePreview } from '../preview-artifact.js'
import { rememberArtifact, currentArtifact } from '../artifact-store.js'
import { getApplicationLifecycle, patchApplicationLifecycle } from '../lifecycle-store.js'
import {
  appendRuntimeEvent,
  getWorkspaceRuntime,
  issueRuntimeCommand,
  patchWorkspaceRuntime,
  type PersistedWorkspaceRuntime,
} from '../runtime-store.js'
import { PLAN_STEP, stepSucceeded, type ExecutionPlan } from '../execution-plan.js'
import { getExecutionPlan, markStepStatus } from '../execution-store.js'
import type { ExecutorContext, ExecutorResult } from './types.js'

function planFromSpec(spec: BusinessSpec): PersistedWorkspaceRuntime['plan'] {
  return {
    appType: spec.businessType,
    source: 'inferred',
    verticalId: spec.catalog.verticalId,
    positioning: spec.visualStyle,
  }
}

function currentPlan(plan: ExecutionPlan): ExecutionPlan {
  return getExecutionPlan(plan.operationId, plan.projectRef) || plan
}

export async function runBuild(plan: ExecutionPlan, ctx: ExecutorContext): Promise<ExecutorResult> {
  const { session } = ctx
  const message = ctx.specSource || ctx.message
  const inferred = inferBusinessSpec(message)
  const spec = rememberBusinessSpec(
    session.projectRef,
    mergeBusinessSpec(getBusinessSpec(session.projectRef), {
      ...inferred,
      businessName: pickBusinessName(inferred.businessName, inferName(message)) || inferred.businessName,
      sourceIntent: inferred.sourceIntent || message,
    }),
  )
  const existing = getWorkspaceRuntime(session.projectRef)
  const identityChanged =
    Boolean(existing?.spec) && specIdentityFingerprint(spec) !== specIdentityFingerprint(existing.spec)
  if (
    existing?.spec &&
    !identityChanged &&
    !isPlaceholderBusinessName(existing.spec.businessName) &&
    existing.preview.status === 'ready' &&
    existing.preview.httpOk !== false &&
    existing.artifactHtml
  ) {
    const runtime = patchWorkspaceRuntime(session.projectRef, {
      spec,
      plan: planFromSpec(spec),
    })
    if (!stepSucceeded(currentPlan(plan), PLAN_STEP.create) && plan.steps.some((s) => s.stepId === PLAN_STEP.create)) {
      markStepStatus(plan, PLAN_STEP.create, 'succeeded', { resultRef: spec.businessName })
    }
    if (!stepSucceeded(currentPlan(plan), PLAN_STEP.preview) && plan.steps.some((s) => s.stepId === PLAN_STEP.preview)) {
      markStepStatus(plan, PLAN_STEP.preview, 'succeeded', {
        resultRef: existing.preview.artifactRef || 'artifact',
      })
    }
    return {
      plan: currentPlan(plan),
      spec,
      runtime: getWorkspaceRuntime(session.projectRef) || runtime,
      recovered: false,
      commandId: existing.lastCommandId || plan.commandId,
    }
  }

  if (!stepSucceeded(currentPlan(plan), PLAN_STEP.create) && plan.steps.some((s) => s.stepId === PLAN_STEP.create)) {
    markStepStatus(plan, PLAN_STEP.create, 'running')
    const createCmd = issueRuntimeCommand(session.projectRef, 'runtime.create', {
      spec: {
        name: spec.businessName,
        vertical: spec.catalog.verticalId,
        positioning: spec.visualStyle,
      },
    })
    patchWorkspaceRuntime(session.projectRef, {
      spec,
      plan: planFromSpec(spec),
      lastCommandId: createCmd.id,
    })
    appendRuntimeEvent(session.projectRef, {
      kind: 'runtime.spec',
      message: `${spec.businessName} / ${spec.catalog.verticalId} / ${spec.visualStyle}`,
      commandId: createCmd.id,
    })
    markStepStatus(plan, PLAN_STEP.create, 'succeeded', { resultRef: createCmd.id })
  } else {
    patchWorkspaceRuntime(session.projectRef, {
      spec,
      plan: planFromSpec(spec),
    })
  }

  if (!identityChanged && stepSucceeded(currentPlan(plan), PLAN_STEP.preview) && existing?.artifactHtml) {
    return {
      plan: currentPlan(plan),
      spec,
      runtime: getWorkspaceRuntime(session.projectRef) || ctx.runtime,
      recovered: false,
      commandId: existing.lastCommandId || plan.commandId,
    }
  }

  const life = getApplicationLifecycle(session.projectRef)
  if (life.currentState === 'preview_ready' || life.currentState === 'verified' || life.currentState === 'live') {
    patchApplicationLifecycle(session.projectRef, 'modifying')
  } else {
    patchApplicationLifecycle(session.projectRef, 'building')
  }
  const previewCmd = issueRuntimeCommand(session.projectRef, 'runtime.preview', {
    businessName: spec.businessName,
  })
  let runtime = patchWorkspaceRuntime(session.projectRef, {
    preview: { ...(getWorkspaceRuntime(session.projectRef)?.preview || ctx.runtime.preview), status: 'building' },
    lastCommandId: previewCmd.id,
  })
  markStepStatus(plan, PLAN_STEP.preview, 'running')

  const job = getLatestProductionLaunchJob(session.projectRef)
  const jobOk = !job || productionJobMatchesSpec(job, spec)
  const reusePriorFiles = !identityChanged && jobOk
  const candidateFiles = flattenSafeFiles(
    reusePriorFiles
      ? {
          ...(job?.files || {}),
          ...(existing?.artifactFiles || {}),
        }
      : {},
  )
  const previewInput = {
    projectRef: session.projectRef,
    spec,
    probe: ctx.probe,
    files: Object.keys(candidateFiles).length ? candidateFiles : undefined,
    buildReact: ctx.launchDeps?.buildReact,
  }
  let built = await materializePreview(previewInput)
  let recovered = false
  if (!built.ok) {
    built = await materializePreview(previewInput)
    recovered = built.ok
    appendRuntimeEvent(session.projectRef, {
      kind: 'runtime.repair',
      message: recovered ? 'Preview rebuilt after first failure' : built.message,
      commandId: previewCmd.id,
    })
  }

  runtime = patchWorkspaceRuntime(session.projectRef, {
    spec,
    plan: planFromSpec(spec),
    preview: {
      status: built.status,
      url: built.url,
      artifactRef: built.artifactRef,
      contentHash: built.contentHash,
      httpOk: built.httpOk,
    },
    artifactHtml: built.html,
    artifactFiles: built.sourceFiles
      ? built.sourceFiles
      : isViteReactProject(candidateFiles)
        ? candidateFiles
        : built.files,
    lastCommandId: previewCmd.id,
  })
  if (built.ok && built.files) {
    const predecessor = currentArtifact(session.projectRef)
    const artifact = rememberArtifact({
      projectRef: session.projectRef,
      applicationType: spec.businessType,
      businessSpec: spec,
      files: built.sourceFiles || built.files,
      predecessorId: predecessor?.artifactId,
    })
    patchApplicationLifecycle(session.projectRef, 'preview_ready', {
      artifactId: artifact.artifactId,
      artifactHash: artifact.artifactHash,
      previewId: built.artifactRef || artifact.artifactId,
      previewUrl: built.url || undefined,
    })
    sealBusinessSpec(session.projectRef, plan.operationId)
  } else {
    patchApplicationLifecycle(session.projectRef, 'failed', {
      lastError: { code: 'preview_failed', message: built.message, stage: 'build' },
    })
  }
  appendRuntimeEvent(session.projectRef, {
    kind: built.ok ? 'runtime.preview.ready' : 'runtime.preview.failed',
    message: built.message,
    commandId: previewCmd.id,
  })
  if (built.ok) {
    markStepStatus(plan, PLAN_STEP.preview, 'succeeded', {
      resultRef: built.artifactRef || built.contentHash || 'preview',
    })
  } else {
    markStepStatus(plan, PLAN_STEP.preview, 'failed', { error: built.message })
  }
  return {
    plan: currentPlan(plan),
    spec,
    runtime: getWorkspaceRuntime(session.projectRef) || runtime,
    recovered,
    commandId: previewCmd.id,
  }
}
