import {
  EMPTY_SNAPSHOT_ID,
  Platform,
  buildGenerationCapabilityContext,
  createCommand,
  createPlatform,
  formatGenerationCapabilityContextPrompt,
  toPlatformEvent,
  type Command,
  type CreatePlatformOptions,
  type GenerationCapabilityContext,
  type PlatformApi,
  type PlatformEventBus,
  type ProjectRuntime,
  type ResolveRuntimeInput,
  type SnapshotId,
} from '@indobase/platform'
import { createAgentRunId } from './ids'
import { createAgentMemoryStore, type AgentMemoryStore } from './memory'
import {
  noopPlanner,
  passthroughExecutor,
  type AgentExecutor,
  type AgentPlanner,
  type ExecuteStepInput,
  type PlanInput,
} from './planner-executor'
import type {
  AgentPlan,
  AgentRun,
  AgentRunStatus,
  AgentRuntimeDomainEvent,
  AgentStep,
} from './types'

export type ResolveCapabilitiesResult = {
  runtime: ProjectRuntime
  generation: GenerationCapabilityContext
  prompt: string
}

export type BeginRunInput = {
  projectRef?: string
  workspaceId?: string
  goal?: string
  correlationId?: string
  baseSnapshotId?: string
  /** Optional pre-built plan; otherwise planner runs on demand via `plan()`. */
  plan?: AgentPlan
}

export type FinishRunInput = {
  status: Extract<AgentRunStatus, 'succeeded' | 'failed' | 'cancelled'>
  error?: string
}

export type QueueCommandMeta = {
  projectRef?: string
  workspaceId?: string
  correlationId?: string
  baseSnapshotId?: SnapshotId | string
}

export type AgentRuntimeApi = {
  readonly platform: PlatformApi
  readonly events: PlatformEventBus
  readonly memory: AgentMemoryStore

  /** Capability Resolver gateway — wraps Platform.resolve + generation context. */
  resolveCapabilities(input: ResolveRuntimeInput): ResolveCapabilitiesResult

  /**
   * Queue a mutation command and publish CommandQueued on the platform bus.
   * Does not execute the command — products / ActionRunner own dispatch later.
   */
  queueCommand(command: Command, meta?: QueueCommandMeta): Command

  /** Start a run envelope (no LLM). Emits AgentRunStarted. */
  beginRun(input?: BeginRunInput): AgentRun

  /** Finish a run envelope. Emits AgentRunFinished. */
  finishRun(runId: string, result: FinishRunInput): AgentRun

  getRun(runId: string): AgentRun | undefined

  /** Invoke injected planner (default: empty plan). */
  plan(input: PlanInput): Promise<AgentPlan>

  /** Invoke injected executor (default: sync passthrough). */
  executeStep(input: ExecuteStepInput): Promise<AgentStep>
}

export type CreateAgentRuntimeOptions = {
  /** Existing platform instance; defaults to process-wide `Platform`. */
  platform?: PlatformApi
  /** Override bus — defaults to `platform.events`. */
  eventBus?: PlatformEventBus
  planner?: AgentPlanner
  executor?: AgentExecutor
  /**
   * When true and no `platform` given, create an isolated platform (tests).
   * Ignored when `platform` is provided.
   */
  createIsolatedPlatform?: boolean
  platformOptions?: CreatePlatformOptions
}

function publishAgentEvent(
  bus: PlatformEventBus,
  event: AgentRuntimeDomainEvent,
  meta: { projectRef?: string; workspaceId?: string; correlationId?: string } = {},
): void {
  bus.publish({
    type: event.type,
    payload: event,
    at: new Date(event.at).toISOString(),
    projectRef: meta.projectRef,
    workspaceId: meta.workspaceId,
    correlationId: meta.correlationId,
  })
}

export function createAgentRuntime(
  options: CreateAgentRuntimeOptions = {},
): AgentRuntimeApi {
  const platform =
    options.platform ??
    (options.createIsolatedPlatform
      ? createPlatform(options.platformOptions)
      : Platform)
  const events = options.eventBus ?? platform.events
  const planner = options.planner ?? noopPlanner
  const executor = options.executor ?? passthroughExecutor
  const memory = createAgentMemoryStore()
  const runs = new Map<string, AgentRun>()

  return {
    platform,
    events,
    memory,

    resolveCapabilities(input) {
      const runtime = platform.resolve(input)
      const generation = buildGenerationCapabilityContext(runtime)
      const prompt = formatGenerationCapabilityContextPrompt(generation)
      return { runtime, generation, prompt }
    },

    queueCommand(command, meta = {}) {
      const projectRef = meta.projectRef ?? command.projectRef
      const workspaceId = meta.workspaceId ?? command.workspaceId
      const correlationId = meta.correlationId ?? command.correlationId
      const baseSnapshotId = (meta.baseSnapshotId ??
        command.baseSnapshotId ??
        EMPTY_SNAPSHOT_ID) as SnapshotId

      events.publish(
        toPlatformEvent(
          {
            type: 'CommandQueued',
            commandId: command.id,
            baseSnapshotId,
            at: Date.now(),
          },
          { projectRef: projectRef as string | undefined, workspaceId: workspaceId as string | undefined, correlationId },
        ),
      )

      return command
    },

    beginRun(input = {}) {
      const id = createAgentRunId()
      const run: AgentRun = {
        id,
        status: 'running',
        projectRef: input.projectRef,
        workspaceId: input.workspaceId,
        goal: input.goal,
        plan: input.plan,
        startedAt: new Date().toISOString(),
        correlationId: input.correlationId,
        baseSnapshotId: input.baseSnapshotId,
      }
      runs.set(id, run)
      publishAgentEvent(
        events,
        {
          type: 'AgentRunStarted',
          runId: id,
          projectRef: input.projectRef,
          workspaceId: input.workspaceId,
          goal: input.goal,
          at: Date.now(),
        },
        {
          projectRef: input.projectRef,
          workspaceId: input.workspaceId,
          correlationId: input.correlationId,
        },
      )
      return { ...run }
    },

    finishRun(runId, result) {
      const existing = runs.get(runId)
      if (!existing) {
        throw new Error(`Unknown agent run: ${runId}`)
      }
      if (existing.status !== 'running' && existing.status !== 'pending') {
        throw new Error(`Agent run already finished: ${runId} (${existing.status})`)
      }
      const finished: AgentRun = {
        ...existing,
        status: result.status,
        error: result.error,
        finishedAt: new Date().toISOString(),
      }
      runs.set(runId, finished)
      publishAgentEvent(
        events,
        {
          type: 'AgentRunFinished',
          runId,
          status: result.status,
          error: result.error,
          at: Date.now(),
        },
        {
          projectRef: finished.projectRef,
          workspaceId: finished.workspaceId,
          correlationId: finished.correlationId,
        },
      )
      return { ...finished }
    },

    getRun(runId) {
      const run = runs.get(runId)
      return run ? { ...run } : undefined
    },

    async plan(input) {
      const plan = await planner(input)
      const current = runs.get(input.run.id)
      if (current) {
        runs.set(input.run.id, { ...current, plan })
      }
      return plan
    },

    async executeStep(input) {
      return executor(input)
    },
  }
}

/** Convenience: create a typed platform Command for queueCommand callers. */
export { createCommand }
