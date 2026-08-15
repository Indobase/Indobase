import {
  applyPreviewMutationToFiles,
  mutateHeroHeadline,
  parsePreviewMutation,
} from '../preview-artifact.js'
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
  const mutation = parsePreviewMutation(message)
  if (!mutation) {
    return { plan, runtime, recovered: false, mutatedHeadline: null, mutated: false, commandId: plan.commandId }
  }

  const html = await loadPreviewHtml(session, runtime)
  const currentFiles = flattenSafeFiles({
    ...(runtime.artifactFiles || {}),
    ...(html ? { 'index.html': runtime.artifactFiles?.['index.html'] || html } : {}),
  })
  const vite = isViteReactProject(currentFiles)
  const applied = applyPreviewMutationToFiles(currentFiles, mutation)
  let nextFiles = applied.files
  let nextHtml = nextFiles['index.html'] || html
  if (!applied.mutated) {
    if (mutation.kind === 'headline' && mutation.headline && html) {
      nextHtml = mutateHeroHeadline(html, mutation.headline)
      if (!nextHtml || nextHtml === html) {
        return {
          plan,
          runtime,
          recovered: false,
          mutatedHeadline: mutation.headline,
          mutated: false,
          commandId: plan.commandId,
        }
      }
      nextFiles = { ...currentFiles, 'index.html': nextHtml }
    } else {
      return {
        plan,
        runtime,
        recovered: false,
        mutatedHeadline: mutation.headline || null,
        mutated: false,
        mutationSummary: mutation.summary,
        commandId: plan.commandId,
      }
    }
  }

  patchApplicationLifecycle(session.projectRef, 'modifying')
  runtime = await persistPreviewHtml({
    session,
    runtime,
    html: nextHtml,
    files: nextFiles,
    mutation: mutation.kind,
    eventKind: 'runtime.preview.mutate',
    eventMessage: `Preview ${mutation.kind} → ${mutation.summary}`,
    launchDeps: ctx.launchDeps,
  })
  runtime = getWorkspaceRuntime(session.projectRef) || runtime
  if (vite && runtime.preview.status === 'failed') {
    return {
      plan,
      runtime,
      recovered: false,
      mutated: false,
      mutatedHeadline: mutation.headline || null,
      mutationSummary: mutation.summary,
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
  markStepStatus(plan, PLAN_STEP.preview, 'succeeded', { resultRef: mutation.summary })
  return {
    plan,
    runtime,
    recovered: true,
    mutated: true,
    mutatedHeadline: mutation.headline || null,
    mutationSummary: mutation.summary,
    commandId: runtime.lastCommandId || plan.commandId,
  }
}
