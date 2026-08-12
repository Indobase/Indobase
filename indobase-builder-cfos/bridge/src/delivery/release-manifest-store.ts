/**
 * Durable ReleaseManifest store (per projectRef).
 * Write-through JSON under INDOBASE_LAUNCH_ROOT/release-manifests (Swarm bind:
 * /var/lib/indobase/launches) so manifests survive container restarts.
 */

import fs from 'node:fs'
import path from 'node:path'

import type { ReleaseManifest } from './release-gate.js'

const manifests = new Map<string, ReleaseManifest>()

function launchRoot(): string {
  return (
    process.env.INDOBASE_RELEASE_MANIFEST_DIR?.trim() ||
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  )
}

function storeDir(): string {
  return path.join(launchRoot(), 'release-manifests')
}

function sanitizeRef(ref: string): string {
  const cleaned = ref.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return cleaned || 'unknown'
}

function filePathFor(projectRef: string): string {
  return path.join(storeDir(), `${sanitizeRef(projectRef)}.json`)
}

function writeManifestFile(manifest: ReleaseManifest): void {
  const file = filePathFor(manifest.projectRef)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

function readManifestFile(projectRef: string): ReleaseManifest | null {
  try {
    const raw = fs.readFileSync(filePathFor(projectRef), 'utf8')
    const parsed = JSON.parse(raw) as ReleaseManifest
    if (!parsed || typeof parsed.projectRef !== 'string' || !parsed.projectRef.trim()) {
      return null
    }
    if (!Array.isArray(parsed.verifierResults) || typeof parsed.timestamp !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Write-through: memory + disk under the launches bind mount. */
export function rememberReleaseManifest(manifest: ReleaseManifest): void {
  const ref = manifest.projectRef.trim()
  if (!ref) return
  const stored: ReleaseManifest = { ...manifest, projectRef: ref }
  manifests.set(ref, stored)
  writeManifestFile(stored)
}

/** Memory first; on miss, hydrate from disk. */
export function getReleaseManifest(projectRef: string): ReleaseManifest | null {
  const ref = projectRef.trim()
  if (!ref) return null
  const cached = manifests.get(ref)
  if (cached) return cached
  const fromDisk = readManifestFile(ref)
  if (fromDisk) {
    manifests.set(ref, fromDisk)
    return fromDisk
  }
  return null
}

export function clearReleaseManifestsForTests(): void {
  manifests.clear()
}
