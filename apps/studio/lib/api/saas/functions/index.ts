import assert from 'node:assert'
import { mkdir, readdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'

import { FileSystemFunctionsArtifactStore } from './fileSystemStore'
import { assertSaaSBackend } from '../util'

/**
 * Returns a per-tenant Edge Functions artifact store rooted at:
 *   <EDGE_FUNCTIONS_MANAGEMENT_FOLDER>/<projectRef>/
 *
 * This isolates each tenant's function source files from other tenants on the
 * same Studio instance — Studio's `apiWrapper` already authenticates the
 * request and validates project membership in the saas tables, so the only
 * way for a caller to reach a different tenant's directory is to forge claims
 * (which would be rejected upstream).
 *
 * Backwards compatibility:
 * - If `projectRef` is omitted (legacy callers), the root folder is used.
 * - On first per-tenant access, any flat (legacy) function folders that look
 *   like edge functions (i.e. contain an `index.*` file) are migrated into
 *   the project's subdirectory so existing deployments don't lose their
 *   functions when this code rolls out.
 */
export function getFunctionsArtifactStore(projectRef?: string) {
  assertSaaSBackend()
  assert(
    process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER,
    'EDGE_FUNCTIONS_MANAGEMENT_FOLDER is required'
  )

  const root = process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER as string
  const tenantFolder =
    typeof projectRef === 'string' && projectRef.trim()
      ? path.join(root, sanitizeProjectRef(projectRef))
      : root

  return new FileSystemFunctionsArtifactStore(tenantFolder)
}

/**
 * One-shot best-effort migration that moves any legacy flat function folders
 * (created before per-tenant scoping) into the given project's subdirectory.
 *
 * Safe to call repeatedly — it only acts on folders that look like an Edge
 * Function (contain an entrypoint named `index.*`) and that don't yet have a
 * matching folder under the tenant root.
 */
export async function migrateLegacyFunctionsForProject(projectRef: string): Promise<void> {
  assertSaaSBackend()
  if (!process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER) return

  const root = process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER
  const tenantFolder = path.join(root, sanitizeProjectRef(projectRef))

  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }

  await mkdir(tenantFolder, { recursive: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'main') continue
    // Skip per-tenant subdirectories (already migrated layout).
    if (looksLikeProjectRef(entry.name)) continue

    const sourcePath = path.join(root, entry.name)
    const files = await readdir(sourcePath, { withFileTypes: true }).catch(() => [])
    const isEdgeFunctionFolder = files.some(
      (f) => f.isFile() && f.name.startsWith('index.')
    )
    if (!isEdgeFunctionFolder) continue

    const destPath = path.join(tenantFolder, entry.name)
    const exists = await stat(destPath).then(
      () => true,
      () => false
    )
    if (exists) continue

    try {
      await rename(sourcePath, destPath)
    } catch {
      // ignore — operator may need to resolve permissions manually
    }
  }
}

function sanitizeProjectRef(ref: string) {
  return ref.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
}

/**
 * Heuristic: project refs look like `[a-z]{20}` on cloud or `p-<uuid>` /
 * `[a-z0-9-]{8,}` on SaaS. We treat any directory matching this shape
 * as a per-tenant subfolder rather than a legacy flat function folder.
 */
function looksLikeProjectRef(name: string) {
  return /^p-[a-f0-9-]{8,}$/i.test(name) || /^[a-z]{20}$/i.test(name)
}
