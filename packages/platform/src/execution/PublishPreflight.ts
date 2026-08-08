/**
 * Workspace preflight for execution.publish — Studio implements with getOsWorkspace + auth.
 */

export type PublishPipelineInput = {
  projectRef: string
  reason?: string
  payload?: Record<string, unknown>
  /**
   * Capabilities to ensure before Deploy (e.g. auth, businessData).
   * Default empty = hosting-only; do not provision auth/db unless listed.
   */
  requiredCapabilities?: string[]
}

export type PublishPreflightSuccess = {
  ok: true
  projectRef: string
  provisionState: 'none' | 'provisioning' | 'ready'
  /** Registrable domain suffix, e.g. indobase.in */
  hostDomain: string
  provisionerConfigured: boolean
  /** When false, Deploy is skipped and publishStatus becomes queued. */
  deployReady: boolean
  queuedMessage?: string
}

export type PublishPreflightFailure = {
  ok: false
  message: string
}

export type PublishPreflightResult = PublishPreflightSuccess | PublishPreflightFailure

export interface PublishPreflightPort {
  validateWorkspace(input: PublishPipelineInput): Promise<PublishPreflightResult>
}
