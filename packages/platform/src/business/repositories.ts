/**
 * Storage-independent Gen 3 repositories.
 * JSON files are the current implementation; Postgres can implement the same contracts.
 */

export type ArtifactRecord = {
  artifactId: string
  projectRef: string
  artifactHash: string
  applicationType: string
  files?: Record<string, string>
  predecessorId?: string
  live?: boolean
  createdAt: string
}

export type VerificationRun = {
  runId: string
  projectRef: string
  artifactId?: string
  artifactHash?: string
  pack: string
  purpose: 'preview' | 'production' | 'smoke'
  passed: boolean
  productionPassed: boolean
  checks: Array<{ id: string; status: string; message: string; evidence?: string }>
  startedAt: string
  completedAt: string
}

export type HostRecord = {
  host: string
  projectRef: string
  applicationId: string
  artifactId?: string
}

export type LiveClaimRecord = {
  projectRef: string
  artifactId: string
  artifactHash: string
  deploymentId: string
  smokeTestId: string
  liveUrl: string
  issuedAt: string
}

export type ExecutionRecord = {
  operationId: string
  projectRef: string
  kind: string
  status: string
  artifactHash?: string
}

export interface ArtifactRepository {
  save(record: ArtifactRecord): Promise<void> | void
  get(artifactId: string): Promise<ArtifactRecord | null> | ArtifactRecord | null
}

export interface VerificationRepository {
  save(run: VerificationRun): Promise<void> | void
  latest(projectRef: string): Promise<VerificationRun | null> | VerificationRun | null
}

export interface HostRepository {
  save(record: HostRecord): Promise<void> | void
  getByHost(host: string): Promise<HostRecord | null> | HostRecord | null
}

export interface LiveClaimRepository {
  save(record: LiveClaimRecord): Promise<void> | void
  get(projectRef: string): Promise<LiveClaimRecord | null> | LiveClaimRecord | null
}

export interface ExecutionRepository {
  save(record: ExecutionRecord): Promise<void> | void
  get(operationId: string): Promise<ExecutionRecord | null> | ExecutionRecord | null
}
