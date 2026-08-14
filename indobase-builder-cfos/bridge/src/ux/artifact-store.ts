/**
 * Immutable artifact registry — MODIFY creates a new identity; LIVE keeps the previous one.
 * In-process Map (same durability class as production jobs / workspace runtime).
 */

import {
  artifactIdFor,
  hashArtifactFiles,
  hashBusinessSpecPayload,
  type ApplicationArtifactIdentity,
} from '../../../../packages/platform/src/business/artifact.ts'
import { loadGen3Record, persistGen3Record } from './gen3-durable.js'

export type StoredArtifact = ApplicationArtifactIdentity & {
  files: Record<string, string>
  predecessorId?: string
  live?: boolean
}

const artifacts = new Map<string, StoredArtifact>()
const currentByProject = new Map<string, string>()
const liveByProject = new Map<string, string>()

export function rememberArtifact(input: {
  projectRef: string
  generationId?: string
  applicationType: 'ecommerce' | 'saas' | 'landing'
  businessSpec?: unknown
  files: Record<string, string>
  predecessorId?: string
}): StoredArtifact {
  const artifactHash = hashArtifactFiles(input.files)
  const artifactId = artifactIdFor(input.projectRef, artifactHash)
  const existing = artifacts.get(artifactId)
  if (existing) {
    currentByProject.set(input.projectRef, artifactId)
    persistGen3Record('artifact-current', input.projectRef, { artifactId })
    return existing
  }
  const stored: StoredArtifact = {
    artifactId,
    projectRef: input.projectRef,
    generationId: input.generationId || `gen_${input.projectRef}`,
    artifactHash,
    applicationType: input.applicationType,
    businessSpecHash: hashBusinessSpecPayload(input.businessSpec),
    createdAt: new Date().toISOString(),
    revision: (getArtifact(currentByProject.get(input.projectRef) || '')?.revision || 0) + 1,
    files: { ...input.files },
    predecessorId: input.predecessorId,
  }
  artifacts.set(artifactId, stored)
  currentByProject.set(input.projectRef, artifactId)
  persistGen3Record('artifacts', artifactId, stored)
  persistGen3Record('artifact-current', input.projectRef, { artifactId })
  return stored
}

export function getArtifact(artifactId: string | undefined | null): StoredArtifact | undefined {
  if (!artifactId) return undefined
  const cached = artifacts.get(artifactId)
  if (cached) return cached
  const disk = loadGen3Record<StoredArtifact>('artifacts', artifactId)
  if (disk) artifacts.set(artifactId, disk)
  return disk || undefined
}

export function currentArtifact(projectRef: string): StoredArtifact | undefined {
  const id = currentByProject.get(projectRef) || loadGen3Record<{ artifactId: string }>('artifact-current', projectRef)?.artifactId
  if (id) currentByProject.set(projectRef, id)
  return getArtifact(id)
}

export function liveArtifact(projectRef: string): StoredArtifact | undefined {
  return getArtifact(liveByProject.get(projectRef))
}

export function markArtifactLive(projectRef: string, artifactId: string): StoredArtifact | undefined {
  const art = artifacts.get(artifactId)
  if (!art || art.projectRef !== projectRef) return undefined
  const next = { ...art, live: true }
  artifacts.set(artifactId, next)
  liveByProject.set(projectRef, artifactId)
  persistGen3Record('artifacts', artifactId, next)
  persistGen3Record('artifact-live', projectRef, { artifactId })
  return next
}

export function artifactBelongsToProject(artifactId: string, projectRef: string): boolean {
  return getArtifact(artifactId)?.projectRef === projectRef
}
