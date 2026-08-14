/**
 * Immutable application artifact identity.
 * Preview and LIVE must point at the same hash — never "whatever files exist now".
 */

import { createHash } from 'node:crypto'

export type ApplicationArtifactIdentity = {
  artifactId: string
  projectRef: string
  generationId: string
  artifactHash: string
  applicationType: 'ecommerce' | 'saas' | 'landing'
  businessSpecHash: string
  createdAt: string
  revision: number
}

export function hashArtifactFiles(files: Record<string, string>): string {
  const hash = createHash('sha256')
  for (const [rel, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(rel)
    hash.update('\n')
    hash.update(content)
  }
  return hash.digest('hex')
}

export function hashBusinessSpecPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload || {})).digest('hex').slice(0, 16)
}

export function artifactIdFor(projectRef: string, artifactHash: string): string {
  return `art_${(projectRef || 'none').slice(0, 12)}_${artifactHash.slice(0, 12)}`
}

export function sameArtifact(a: { artifactHash?: string | null }, b: { artifactHash?: string | null }): boolean {
  const left = (a.artifactHash || '').trim()
  const right = (b.artifactHash || '').trim()
  return Boolean(left && right && left === right)
}

/**
 * Host labels belong to one projectRef. A new application cannot inherit
 * corev1-aug13 (or any other workspace's) production host.
 */
export type HostBinding = {
  host: string
  projectRef: string
  applicationId: string
  artifactId?: string
}

export function canonicalHostLabel(projectRef: string): string {
  const raw = (projectRef || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return raw || 'app'
}

export function assertHostOwnedByProject(
  binding: HostBinding | null | undefined,
  projectRef: string,
): { ok: true } | { ok: false; error: string } {
  const ref = (projectRef || '').trim()
  if (!binding) return { ok: false, error: 'host_unbound' }
  if (binding.projectRef !== ref) return { ok: false, error: 'host_owned_by_other_project' }
  return { ok: true }
}

export function hostReuseRejected(host: string, ownerProjectRef: string, claimantProjectRef: string): boolean {
  const h = (host || '').toLowerCase()
  if (!h) return false
  if (h.includes('corev1-aug13')) return ownerProjectRef !== claimantProjectRef
  return Boolean(ownerProjectRef && claimantProjectRef && ownerProjectRef !== claimantProjectRef)
}
