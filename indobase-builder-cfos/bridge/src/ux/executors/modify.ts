import { extractRequestedHeadline, mutateHeroHeadline } from '../preview-artifact.js'
import { getWorkspaceRuntime } from '../runtime-store.js'
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
  if (!html) {
    return { plan, runtime, recovered: false, mutatedHeadline: headline, mutated: false, commandId: plan.commandId }
  }

  const nextHtml = mutateHeroHeadline(html, headline)
  if (!nextHtml || nextHtml === html) {
    return { plan, runtime, recovered: false, mutatedHeadline: headline, mutated: false, commandId: plan.commandId }
  }

  const files = { ...(runtime.artifactFiles || {}), 'index.html': nextHtml }
  runtime = await persistPreviewHtml({
    session,
    runtime,
    html: nextHtml,
    files,
    mutation: 'hero_headline',
    eventKind: 'runtime.preview.mutate',
    eventMessage: `Hero headline → ${headline}`,
    launchDeps: ctx.launchDeps,
  })
  runtime = getWorkspaceRuntime(session.projectRef) || runtime
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
