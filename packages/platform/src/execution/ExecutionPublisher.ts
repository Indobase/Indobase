import type { DeploymentResult } from './DeploymentResult'
import {
  ExecutionOrchestrator,
  type ExecutionOrchestratorOptions,
  type PublishPipelineInput,
} from './ExecutionOrchestrator'

/**
 * Public entry for execution.publish — hides orchestrator wiring from Platform API / OS bridge.
 */

export type ExecutionPublishInput = PublishPipelineInput

export interface ExecutionPublisher {
  publish(input: ExecutionPublishInput): Promise<DeploymentResult>
}

export class DefaultExecutionPublisher implements ExecutionPublisher {
  readonly orchestrator: ExecutionOrchestrator

  constructor(options: ExecutionOrchestratorOptions) {
    this.orchestrator = new ExecutionOrchestrator(options)
  }

  publish(input: ExecutionPublishInput): Promise<DeploymentResult> {
    return this.orchestrator.runPublishPipeline(input)
  }
}

export function createExecutionPublisher(
  options: ExecutionOrchestratorOptions,
): ExecutionPublisher {
  return new DefaultExecutionPublisher(options)
}
