import type { ExecutionId, ProjectRef, SnapshotId } from '../ids'

/**
 * Infrastructure adapter for publish — wraps provisioner / static host / Traefik later.
 * Kernel defines the contract; Studio and data-plane routes implement it in PR 2+.
 */

export type DeploymentContext = {
  executionId: ExecutionId
  projectRef: ProjectRef | string
  snapshotId?: SnapshotId
  domain?: string
  payload?: Record<string, unknown>
}

export type DeployArtifact = {
  artifactRef?: string
}

export type DomainAssignment = {
  liveUrl: string
}

export type HealthProbe = {
  healthy: boolean
  details?: Record<string, unknown>
}

export interface DeploymentAdapter {
  prepare(ctx: DeploymentContext): Promise<void>
  deploy(ctx: DeploymentContext): Promise<DeployArtifact>
  assignDomain(ctx: DeploymentContext, domain: string): Promise<DomainAssignment>
  provisionTLS(ctx: DeploymentContext, domain: string): Promise<void>
  healthCheck(ctx: DeploymentContext, liveUrl: string): Promise<HealthProbe>
  rollback(ctx: DeploymentContext, reason: string): Promise<void>
}
