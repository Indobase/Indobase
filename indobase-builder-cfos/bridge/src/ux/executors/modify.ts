import { applyHeadlineToProjectFiles, extractRequestedHeadline, mutateHeroHeadline } from '../preview-artifact.js'
import { currentArtifact, rememberArtifact } from '../artifact-store.js'
import { patchApplicationLifecycle } from '../lifecycle-store.js'
import { getWorkspaceRuntime } from '../runtime-store.js'
import { flattenSafeFiles, isViteReactProject } from '../../production-launch/react-project.js'
import type { ExecutionPlan } from '../execution-plan.js'
import { PLAN_STEP } from '../execution-plan.js'
import { markStepStatus } from '../execution-store.js'
import { loadPreviewHtml, persistPreviewHtml } from './preview-persist.js'
import type { ExecutorContext, ExecutorResult } from './types.js'

export async function runModify(plan: ExecutionPlan, ctx: ExecutorContext): Promise<ExecutorResult> {
  const { session } = ctx
  const message = ctx.message
  let runtime = ctx.runtime
  const headline = extractRequestedHeadline(message)
  if (!headline) {
    return { plan, runtime, recovered: false, mutatedHeadline: null, mutated: false, commandId: plan.commandId }
  }

  const html = await loadPreviewHtml(session, runtime)
  const currentFiles = flattenSafeFiles({
    ...(runtime.artifactFiles || {}),
    ...(html ? { 'index.html': runtime.artifactFiles?.['index.html'] || html } : {}),
  })
  const vite = isViteReactProject(currentFiles)
  const applied = applyHeadlineToProjectFiles(currentFiles, headline)
  let nextFiles = applied.files
  let nextHtml = nextFiles['index.html'] || html
  if (!applied.mutated) {
    if (!html) {
      return { plan, runtime, recovered: false, mutatedHeadline: headline, mutated: false, commandId: plan.commandId }
    }
    nextHtml = mutateHeroHeadline(html, headline)
    if (!nextHtml || nextHtml === html) {
      return { plan, runtime, recovered: false, mutatedHeadline: headline, mutated: false, commandId: plan.commandId }
    }
    nextFiles = { ...currentFiles, 'index.html': nextHtml }
  }

  patchApplicationLifecycle(session.projectRef, 'modifying')
  runtime = await persistPreviewHtml({
    session,
    runtime,
    html: nextHtml,
    files: nextFiles,
    mutation: 'hero_headline',
    eventKind: 'runtime.preview.mutate',
    eventMessage: `Hero headline → ${headline}`,
    launchDeps: ctx.launchDeps,
  })
  runtime = getWorkspaceRuntime(session.projectRef) || runtime
  if (vite && runtime.preview.status === 'failed') {
    return {
      plan,
      runtime,
      recovered: false,
      mutated: false,
      mutatedHeadline: headline,
      commandId: runtime.lastCommandId || plan.commandId,
    }
  }
  const persisted = flattenSafeFiles(runtime.artifactFiles || nextFiles)
  const predecessor = currentArtifact(session.projectRef)
  const artifact = rememberArtifact({
    projectRef: session.projectRef,
    applicationType: runtime.spec?.businessType || 'ecommerce',
    businessSpec: runtime.spec,
    files: persisted,
    predecessorId: predecessor?.artifactId,
  })
  patchApplicationLifecycle(session.projectRef, 'preview_ready', {
    artifactId: artifact.artifactId,
    artifactHash: artifact.artifactHash,
  })
  markStepStatus(plan, PLAN_STEP.preview, 'succeeded', { resultRef: headline })
  return {
    plan,
    runtime,
    recovered: true,
    mutated: true,
    mutatedHeadline: headline,
    commandId: runtime.lastCommandId || plan.commandId,
  }
}
