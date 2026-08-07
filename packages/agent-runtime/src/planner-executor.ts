import type { AgentPlan, AgentRun, AgentStep } from './types'
import { createAgentStepId } from './ids'

/**
 * Planner / Executor injectors — Gen-1 stubs.
 * Defaults: empty plan / sync passthrough so Builder can plug real implementations later.
 */

export type PlanInput = {
  run: AgentRun
  goal?: string
  context?: unknown
}

export type ExecuteStepInput = {
  run: AgentRun
  plan: AgentPlan
  step: AgentStep
}

export type AgentPlanner = (input: PlanInput) => AgentPlan | Promise<AgentPlan>
export type AgentExecutor = (input: ExecuteStepInput) => AgentStep | Promise<AgentStep>

/** Default planner — empty step list (no LLM). */
export const noopPlanner: AgentPlanner = (input) => ({
  runId: input.run.id,
  goal: input.goal ?? input.run.goal,
  steps: [],
})

/** Default executor — mark step succeeded and return as-is (sync passthrough). */
export const passthroughExecutor: AgentExecutor = (input) => ({
  ...input.step,
  // Always complete unless the step was already marked failed.
  status: input.step.status === 'failed' ? 'failed' : 'succeeded',
})

/** Helper: build a single-step plan for tests / thin adapters. */
export function singleStepPlan(runId: string, kind: string, input?: unknown): AgentPlan {
  return {
    runId,
    steps: [
      {
        id: createAgentStepId(kind),
        kind,
        input,
        status: 'pending',
      },
    ],
  }
}
