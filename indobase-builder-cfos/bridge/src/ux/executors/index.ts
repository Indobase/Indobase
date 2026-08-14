import type { ExecutionPlan } from '../execution-plan.js'
import { beginOrResumePlan, getExecutionPlan, markPlanStatus } from '../execution-store.js'
import { runBuild } from './build.js'
import { runLaunch } from './launch.js'
import { runModify } from './modify.js'
import { runOperate } from './operate.js'
import type { ExecutorContext, ExecutorResult } from './types.js'

export async function dispatchExecutionPlan(
  plan: ExecutionPlan,
  ctx: ExecutorContext,
): Promise<ExecutorResult> {
  const durable = beginOrResumePlan(plan)
  if (durable.status === 'succeeded' && durable.steps.every((s) => s.status === 'succeeded')) {
    return {
      plan: durable,
      runtime: ctx.runtime,
      recovered: false,
      commandId: durable.commandId,
      spec: ctx.runtime.spec,
    }
  }
  markPlanStatus(durable.operationId, 'running', durable.projectRef)

  let result: ExecutorResult
  switch (durable.turnClass) {
    case 'build':
      result = await runBuild(durable, ctx)
      break
    case 'modify':
      result = await runModify(durable, ctx)
      break
    case 'launch':
      result = await runLaunch(durable, ctx)
      break
    case 'operate':
      result = await runOperate(durable, ctx)
      break
    default:
      result = {
        plan: durable,
        runtime: ctx.runtime,
        recovered: false,
        commandId: durable.commandId,
      }
  }

  const latest = getExecutionPlan(durable.operationId, durable.projectRef) || result.plan
  const failed = latest.steps.some((s) => s.status === 'failed')
  const allOk = latest.steps.length > 0 && latest.steps.every((s) => s.status === 'succeeded')
  markPlanStatus(durable.operationId, failed ? 'failed' : allOk ? 'succeeded' : 'interrupted', durable.projectRef)
  return { ...result, plan: getExecutionPlan(durable.operationId, durable.projectRef) || latest }
}

export { runBuild } from './build.js'
export { runModify } from './modify.js'
export { runLaunch } from './launch.js'
export { runOperate } from './operate.js'
export type { ExecutorContext, ExecutorResult } from './types.js'
