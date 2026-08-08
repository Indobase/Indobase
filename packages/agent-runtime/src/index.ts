/**
 * @indobase/agent-runtime — Shared Agent Runtime (Gen-1)
 *
 * Thin inheritance layer over @indobase/platform.
 * Imports platform; kernel must never import this package.
 *
 * @see docs/PLATFORM.md Phase 3
 */

export type {
  AgentRunStatus,
  AgentStepStatus,
  AgentStep,
  AgentPlan,
  AgentMemoryNote,
  AgentMemory,
  AgentRun,
  AgentRunStartedEvent,
  AgentRunFinishedEvent,
  AgentRuntimeDomainEvent,
} from './types'

export { createAgentRunId, createAgentStepId } from './ids'

export { createAgentMemoryStore, type AgentMemoryStore } from './memory'

export {
  noopPlanner,
  passthroughExecutor,
  singleStepPlan,
  type AgentPlanner,
  type AgentExecutor,
  type PlanInput,
  type ExecuteStepInput,
} from './planner-executor'

export {
  createAgentRuntime,
  createCommand,
  type AgentRuntimeApi,
  type CreateAgentRuntimeOptions,
  type ResolveCapabilitiesResult,
  type BeginRunInput,
  type FinishRunInput,
  type QueueCommandMeta,
} from './runtime'

/** Re-export frequently used platform types for agent callers. */
export type {
  Command,
  GenerationCapabilityContext,
  PlatformApi,
  PlatformEventBus,
  ProjectRuntime,
  ResolveRuntimeInput,
} from '@indobase/platform'
