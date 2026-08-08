import type { ExecutionId, ProjectRef } from '../ids'
import type { ExecutionPipelineStage } from './ExecutionPipeline'

/** Stable failure codes for publish pipeline outcomes — not infrastructure leak. */
export type DeploymentErrorCode =
  | 'VALIDATION_FAILED'
  | 'SNAPSHOT_FREEZE_FAILED'
  | 'BUILD_FAILED'
  | 'CAPABILITY_ENSURE_FAILED'
  | 'DEPLOY_FAILED'
  | 'DOMAIN_ASSIGN_FAILED'
  | 'TLS_FAILED'
  | 'HEALTH_CHECK_FAILED'
  | 'ROLLBACK_FAILED'
  | 'NOT_IMPLEMENTED'
  | 'UNKNOWN'

export type PublishStatus = 'queued' | 'published'

export type DeploymentSuccess = {
  ok: true
  liveUrl: string
  stage: ExecutionPipelineStage
  outputRef?: string
  /** OS API publish status — PR 2 maps to /deploy/publish response. */
  publishStatus?: PublishStatus
  message?: string
}

export type DeploymentFailure = {
  ok: false
  stage: ExecutionPipelineStage
  errorCode: DeploymentErrorCode
  message: string
}

export type DeploymentOutcome = DeploymentSuccess | DeploymentFailure

export type DeploymentResult = {
  executionId: ExecutionId
  projectRef: ProjectRef | string
  outcome: DeploymentOutcome
  startedAt: string
  finishedAt?: string
}

export function deploymentSucceeded(
  input: Omit<DeploymentSuccess, 'ok'> & {
    executionId: ExecutionId
    projectRef: ProjectRef | string
    startedAt: string
    finishedAt?: string
  },
): DeploymentResult {
  return {
    executionId: input.executionId,
    projectRef: input.projectRef,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    outcome: {
      ok: true,
      liveUrl: input.liveUrl,
      stage: input.stage,
      outputRef: input.outputRef,
      publishStatus: input.publishStatus,
      message: input.message,
    },
  }
}

export function deploymentFailed(
  input: Omit<DeploymentFailure, 'ok'> & {
    executionId: ExecutionId
    projectRef: ProjectRef | string
    startedAt: string
    finishedAt?: string
  },
): DeploymentResult {
  return {
    executionId: input.executionId,
    projectRef: input.projectRef,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    outcome: {
      ok: false,
      stage: input.stage,
      errorCode: input.errorCode,
      message: input.message,
    },
  }
}
