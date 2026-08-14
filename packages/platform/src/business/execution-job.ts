/**
 * Durable verification / execution job records.
 * VERIFY is a platform service; this is the persisted evidence, not chat state.
 */

export type ExecutionJobKind = 'build' | 'preview' | 'verify' | 'launch' | 'smoke' | 'modify'

export type ExecutionJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type ExecutionEvidenceItem = {
  id: string
  status: 'pass' | 'fail' | 'skip'
  message: string
}

export type ExecutionJobRecord = {
  operationId: string
  kind: ExecutionJobKind
  projectRef: string
  artifactId?: string
  artifactHash?: string
  revision: number
  status: ExecutionJobStatus
  startedAt: string
  completedAt?: string
  error?: string
  evidence: ExecutionEvidenceItem[]
}

export function newExecutionJob(input: {
  operationId: string
  kind: ExecutionJobKind
  projectRef: string
  artifactId?: string
  artifactHash?: string
  revision?: number
}): ExecutionJobRecord {
  return {
    operationId: input.operationId,
    kind: input.kind,
    projectRef: input.projectRef,
    artifactId: input.artifactId,
    artifactHash: input.artifactHash,
    revision: input.revision ?? 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    evidence: [],
  }
}
