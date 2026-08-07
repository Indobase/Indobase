/**
 * Ordered stages for business.launch — wraps execution.publish as the Publish stage.
 * Plan / Configure / Verify / Operator are ports siblings fill in later PRs.
 */

export const BusinessLaunchStage = {
  Plan: 'Plan',
  EnsureCapabilities: 'EnsureCapabilities',
  Publish: 'Publish',
  ConfigureBusiness: 'ConfigureBusiness',
  Verify: 'Verify',
  StartOperator: 'StartOperator',
  MarkBusinessLive: 'MarkBusinessLive',
  EmitEvents: 'EmitEvents',
} as const

export type BusinessLaunchStage =
  (typeof BusinessLaunchStage)[keyof typeof BusinessLaunchStage]

/** Canonical business.launch order — do not reorder without ADR update. */
export const BUSINESS_LAUNCH_PIPELINE: readonly BusinessLaunchStage[] = [
  BusinessLaunchStage.Plan,
  BusinessLaunchStage.EnsureCapabilities,
  BusinessLaunchStage.Publish,
  BusinessLaunchStage.ConfigureBusiness,
  BusinessLaunchStage.Verify,
  BusinessLaunchStage.StartOperator,
  BusinessLaunchStage.MarkBusinessLive,
  BusinessLaunchStage.EmitEvents,
] as const

export type BusinessLaunchPipelineContext = {
  workspaceRef: string
  stage: BusinessLaunchStage
  payload?: Record<string, unknown>
}
