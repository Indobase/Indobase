/**
 * Minimal agent envelopes — Gen-1 inheritance types only.
 * No LLM schemas, no durable store, no workflow DAG productization.
 */

export type AgentRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type AgentStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'

export type AgentStep = {
  id: string
  /** Opaque step verb — products interpret (e.g. 'codegen', 'repair', 'inspect'). */
  kind: string
  input?: unknown
  output?: unknown
  status?: AgentStepStatus
  error?: string
}

export type AgentPlan = {
  runId: string
  goal?: string
  steps: AgentStep[]
}

export type AgentMemoryNote = {
  at: string
  text: string
  tags?: string[]
  projectRef?: string
}

/** Append-only note bag for a run (in-process Gen-1). */
export type AgentMemory = {
  runId: string
  projectRef?: string
  notes: AgentMemoryNote[]
}

export type AgentRun = {
  id: string
  status: AgentRunStatus
  projectRef?: string
  workspaceId?: string
  goal?: string
  plan?: AgentPlan
  startedAt?: string
  finishedAt?: string
  error?: string
  correlationId?: string
  baseSnapshotId?: string
}

export type AgentRunStartedEvent = {
  type: 'AgentRunStarted'
  runId: string
  projectRef?: string
  workspaceId?: string
  goal?: string
  at: number
}

export type AgentRunFinishedEvent = {
  type: 'AgentRunFinished'
  runId: string
  status: Extract<AgentRunStatus, 'succeeded' | 'failed' | 'cancelled'>
  error?: string
  at: number
}

export type AgentRuntimeDomainEvent = AgentRunStartedEvent | AgentRunFinishedEvent
