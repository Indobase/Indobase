/**
 * Ordered stages for execution.publish — orchestrator walks this list.
 * PR 1 defines types only; PR 2–3 wire behavior.
 */

export const ExecutionPipelineStage = {
  ValidateWorkspace: 'ValidateWorkspace',
  FreezeSnapshot: 'FreezeSnapshot',
  Build: 'Build',
  CapabilityEnsure: 'CapabilityEnsure',
  Deploy: 'Deploy',
  AssignDomain: 'AssignDomain',
  SSL: 'SSL',
  HealthCheck: 'HealthCheck',
  MarkLive: 'MarkLive',
  EmitEvents: 'EmitEvents',
} as const

export type ExecutionPipelineStage =
  (typeof ExecutionPipelineStage)[keyof typeof ExecutionPipelineStage]

/** Canonical publish pipeline order — do not reorder without ADR update. */
export const EXECUTION_PUBLISH_PIPELINE: readonly ExecutionPipelineStage[] = [
  ExecutionPipelineStage.ValidateWorkspace,
  ExecutionPipelineStage.FreezeSnapshot,
  ExecutionPipelineStage.Build,
  ExecutionPipelineStage.CapabilityEnsure,
  ExecutionPipelineStage.Deploy,
  ExecutionPipelineStage.AssignDomain,
  ExecutionPipelineStage.SSL,
  ExecutionPipelineStage.HealthCheck,
  ExecutionPipelineStage.MarkLive,
  ExecutionPipelineStage.EmitEvents,
] as const

export type ExecutionPipelineContext = {
  projectRef: string
  stage: ExecutionPipelineStage
  payload?: Record<string, unknown>
}
