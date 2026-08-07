import type { Command } from '../commands'
import type { ExecutionId, ProjectRef, CommandId } from '../ids'
import { createExecutionId } from '../ids'
import { createCommand } from '../commands'

/**
 * Execution — how work runs. Docker / WebContainer / Vite are adapters.
 */

export type ExecutionKind =
  | 'execution.provision'
  | 'execution.repair'
  | 'execution.stop'
  | 'execution.teardown'
  | 'execution.backup'
  | 'execution.restore'
  | 'execution.build'
  | 'execution.preview'
  | 'execution.publish'
  | (string & {})

export type ExecutionStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type ExecutionRequest = {
  id: ExecutionId
  kind: ExecutionKind
  projectRef: ProjectRef | string
  commandId?: CommandId | string
  payload?: Record<string, unknown>
  reason?: string
}

export type ExecutionResult = {
  executionId: ExecutionId
  ok: boolean
  status: ExecutionStatus
  outputRef?: string
  error?: string
  health?: Record<string, unknown>
}

export type ExecutionCommand = Command<ExecutionKind, {
  projectRef: string
  reason?: string
  hints?: Record<string, unknown>
}>

export function createExecutionRequest(input: {
  kind: ExecutionKind
  projectRef: string
  reason?: string
  payload?: Record<string, unknown>
  commandId?: string
}): ExecutionRequest {
  return {
    id: createExecutionId(),
    kind: input.kind,
    projectRef: input.projectRef,
    commandId: input.commandId,
    payload: input.payload,
    reason: input.reason,
  }
}

/** Map legacy provisioner route reasons into Execution commands (types only). */
export const ExecutionCommands = {
  provision: (projectRef: string, reason = 'project_create') =>
    createCommand('execution.provision' as const, { projectRef, reason }),
  repair: (projectRef: string, reason = 'repair') =>
    createCommand('execution.repair' as const, { projectRef, reason }),
  stop: (projectRef: string, reason = 'project_pause') =>
    createCommand('execution.stop' as const, { projectRef, reason }),
  teardown: (projectRef: string, reason = 'teardown') =>
    createCommand('execution.teardown' as const, { projectRef, reason }),
  backup: (projectRef: string, reason = 'backup') =>
    createCommand('execution.backup' as const, { projectRef, reason }),
  restore: (projectRef: string, reason = 'restore') =>
    createCommand('execution.restore' as const, { projectRef, reason }),
  build: (projectRef: string, reason = 'build') =>
    createCommand('execution.build' as const, { projectRef, reason }),
  preview: (projectRef: string, reason = 'preview') =>
    createCommand('execution.preview' as const, { projectRef, reason }),
  publish: (projectRef: string, reason = 'publish') =>
    createCommand('execution.publish' as const, { projectRef, reason }),
} as const

/** Provisioner HTTP path ↔ Execution kind (documentation helper). */
export const PROVISIONER_ROUTE_TO_EXECUTION: Record<string, ExecutionKind> = {
  '/provision': 'execution.provision',
  '/provision-shared-gateway': 'execution.provision',
  '/repair-stack': 'execution.repair',
  '/stop': 'execution.stop',
  '/teardown': 'execution.teardown',
  '/backup-tenant': 'execution.backup',
  '/restore-tenant': 'execution.restore',
  '/publish-site': 'execution.publish',
}

export const EXECUTION_TO_PROVISIONER_ROUTE: Partial<Record<ExecutionKind, string>> = {
  'execution.provision': '/provision',
  'execution.repair': '/repair-stack',
  'execution.stop': '/stop',
  'execution.teardown': '/teardown',
  'execution.backup': '/backup-tenant',
  'execution.restore': '/restore-tenant',
  'execution.publish': '/publish-site',
}

/** Resolve provisioner path for an Execution kind (shared-gateway uses alternate provision route). */
export function provisionerRouteForExecution(
  kind: ExecutionKind,
  options: { sharedGateway?: boolean } = {},
): string | undefined {
  if (kind === 'execution.provision' && options.sharedGateway) {
    return '/provision-shared-gateway'
  }
  return EXECUTION_TO_PROVISIONER_ROUTE[kind]
}

export function executionKindForProvisionerRoute(route: string): ExecutionKind | undefined {
  const normalized = route.startsWith('/') ? route : `/${route}`
  return PROVISIONER_ROUTE_TO_EXECUTION[normalized]
}

export function toExecutionResult(
  request: ExecutionRequest,
  outcome: {
    ok: boolean
    outputRef?: string
    error?: string
    health?: Record<string, unknown>
  },
): ExecutionResult {
  return {
    executionId: request.id,
    ok: outcome.ok,
    status: outcome.ok ? 'succeeded' : 'failed',
    outputRef: outcome.outputRef,
    error: outcome.error,
    health: outcome.health,
  }
}

export * from './DeploymentResult'
export * from './DeploymentAdapter'
export * from './ExecutionPipeline'
export * from './PublishPreflight'
export * from './PublishPorts'
export * from './ExecutionOrchestrator'
export * from './ExecutionPublisher'
