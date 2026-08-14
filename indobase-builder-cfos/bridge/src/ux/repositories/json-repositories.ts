/**
 * JSON implementations of Gen 3 repositories (INDOBASE_LAUNCH_ROOT/gen3).
 * Swap this module for a Postgres implementation without changing callers.
 */

import type {
  ArtifactRecord,
  ArtifactRepository,
  ExecutionRecord,
  ExecutionRepository,
  HostRecord,
  HostRepository,
  LiveClaimRecord,
  LiveClaimRepository,
  VerificationRepository,
  VerificationRun,
} from '../../../../packages/platform/src/business/repositories.ts'
import { loadGen3Record, persistGen3Record } from '../gen3-durable.js'

export class JsonArtifactRepository implements ArtifactRepository {
  save(record: ArtifactRecord): void {
    persistGen3Record('artifacts', record.artifactId, record)
  }
  get(artifactId: string): ArtifactRecord | null {
    return loadGen3Record<ArtifactRecord>('artifacts', artifactId)
  }
}

export class JsonVerificationRepository implements VerificationRepository {
  save(run: VerificationRun): void {
    persistGen3Record('verification-runs', run.runId, run)
    persistGen3Record('verification-latest', run.projectRef, run)
  }
  latest(projectRef: string): VerificationRun | null {
    return loadGen3Record<VerificationRun>('verification-latest', projectRef)
  }
}

export class JsonHostRepository implements HostRepository {
  save(record: HostRecord): void {
    persistGen3Record('hosts', record.host.replace(/[^a-z0-9.-]+/g, '-'), record)
  }
  getByHost(host: string): HostRecord | null {
    return loadGen3Record<HostRecord>('hosts', host.replace(/[^a-z0-9.-]+/g, '-'))
  }
}

export class JsonLiveClaimRepository implements LiveClaimRepository {
  save(record: LiveClaimRecord): void {
    persistGen3Record('live-claims', record.projectRef, record)
  }
  get(projectRef: string): LiveClaimRecord | null {
    return loadGen3Record<LiveClaimRecord>('live-claims', projectRef)
  }
}

export class JsonExecutionRepository implements ExecutionRepository {
  save(record: ExecutionRecord): void {
    persistGen3Record('execution', record.operationId, record)
  }
  get(operationId: string): ExecutionRecord | null {
    return loadGen3Record<ExecutionRecord>('execution', operationId)
  }
}

export const jsonRepositories = {
  artifacts: new JsonArtifactRepository(),
  verification: new JsonVerificationRepository(),
  hosts: new JsonHostRepository(),
  liveClaims: new JsonLiveClaimRepository(),
  execution: new JsonExecutionRepository(),
}
