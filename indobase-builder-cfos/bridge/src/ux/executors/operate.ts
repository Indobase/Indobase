import { injectStorefrontProductSnapshot, storefrontHasCommerceAbi } from '../preview-artifact.js'
import { appendRuntimeEvent, getWorkspaceRuntime } from '../runtime-store.js'
import { classifyStoreCommand, executeStoreCommand } from '../store-commands.js'
import { deriveStoreMutationKey, type ExecutionPlan } from '../execution-plan.js'
import { getExecutionPlan, markStepStatus } from '../execution-store.js'
import { loadPreviewHtml, persistPreviewHtml } from './preview-persist.js'
import type { ExecutorContext, ExecutorResult } from './types.js'

const STOREFRONT_VISIBLE_KINDS = new Set([
  'product.create',
  'product.update',
  'inventory.update',
  'variant.create',
  'collection.create',
  'collection.assign',
])

export async function runOperate(plan: ExecutionPlan, ctx: ExecutorContext): Promise<ExecutorResult> {
  const { session } = ctx
  let runtime = ctx.runtime
  let snapshot = ctx.snapshot
  const classifiedStore = classifyStoreCommand(ctx.message)
  if (!classifiedStore || (classifiedStore.readOnly && !ctx.catalogDeps)) {
    return {
      plan,
      runtime,
      recovered: false,
      store: null,
      snapshot,
      commandId: plan.commandId,
    }
  }

  const mutateStep = plan.steps[0]
  const mutationKey =
    plan.idempotencyKey ||
    (classifiedStore ? deriveStoreMutationKey(session.projectRef, classifiedStore, ctx.message) : undefined)
  const store = await executeStoreCommand({
    session,
    guest: false,
    requestedProjectRef: session.projectRef,
    message: ctx.message,
    deps: ctx.catalogDeps,
    idempotencyKey: mutationKey,
  })
  if (mutateStep) {
    if (store.ok) {
      markStepStatus(plan, mutateStep.stepId, 'succeeded', {
        resultRef: store.command?.payload && typeof store.command.payload === 'object'
          ? String((store.command.payload as { productId?: string }).productId || mutateStep.command)
          : mutateStep.command,
      })
    } else {
      markStepStatus(plan, mutateStep.stepId, 'failed', { error: store.message })
    }
  }
  let recovered = store.mutated
  if (store.ok && store.snapshot && (store.mutated || ctx.catalogDeps)) {
    snapshot = store.snapshot
  }
  if (store.mutated) {
    appendRuntimeEvent(session.projectRef, {
      kind: store.kind || 'product.create',
      message: store.message,
      commandId: store.command?.id,
    })
    if (store.ok && store.kind && STOREFRONT_VISIBLE_KINDS.has(store.kind) && store.snapshot) {
      const html = await loadPreviewHtml(session, runtime)
      if (html && storefrontHasCommerceAbi(html)) {
        const nextHtml = injectStorefrontProductSnapshot(
          html,
          store.snapshot.products || [],
          store.snapshot.collections || [],
        )
        if (nextHtml && nextHtml !== html) {
          const files = { ...(runtime.artifactFiles || {}), 'index.html': nextHtml }
          runtime = await persistPreviewHtml({
            session,
            runtime,
            html: nextHtml,
            files,
            mutation: 'catalog_projection',
            eventKind: 'runtime.catalog.project',
            eventMessage: `Storefront catalog projection (${store.snapshot.products?.length || 0} products)`,
            launchDeps: ctx.launchDeps,
          })
        }
      }
    }
  }
  return {
    plan,
    runtime: getWorkspaceRuntime(session.projectRef) || runtime,
    recovered,
    store,
    snapshot,
    commandId: store.command?.id || plan.commandId,
    plan: getExecutionPlan(plan.operationId, plan.projectRef) || plan,
  }
}
