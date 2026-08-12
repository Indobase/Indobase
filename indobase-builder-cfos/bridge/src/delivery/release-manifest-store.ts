/**
 * In-memory ReleaseManifest store (per projectRef). Survives process lifetime only.
 */

import type { ReleaseManifest } from './release-gate.js'

const manifests = new Map<string, ReleaseManifest>()

export function rememberReleaseManifest(manifest: ReleaseManifest): void {
  const ref = manifest.projectRef.trim()
  if (!ref) return
  manifests.set(ref, manifest)
}

export function getReleaseManifest(projectRef: string): ReleaseManifest | null {
  const ref = projectRef.trim()
  if (!ref) return null
  return manifests.get(ref) || null
}

export function clearReleaseManifestsForTests(): void {
  manifests.clear()
}
