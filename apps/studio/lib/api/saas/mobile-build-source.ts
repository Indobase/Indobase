import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const MAX_MOBILE_BUILD_SOURCE_FILES = 400
export const MAX_MOBILE_BUILD_SOURCE_TOTAL_BYTES = 12 * 1024 * 1024
export const MAX_MOBILE_BUILD_SOURCE_FILE_BYTES = 2 * 1024 * 1024

const BLOCKED_PATH_SEGMENTS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.expo'])

export type StagedMobileBuildSource = {
  buildId: string
  fileCount: number
  sourcePath: string
  totalBytes: number
}

function resolveMobileBuildSourceRoot() {
  const configured = process.env.PROJECT_MOBILE_BUILD_SOURCE_ROOT?.trim()
  return configured || '/var/lib/indobase/mobile-builds'
}

function sanitizeProjectRef(projectRef: string) {
  const sanitized = projectRef.replace(/[^a-zA-Z0-9_-]/g, '_')

  if (!sanitized) {
    throw new Error('Invalid project ref for mobile build source staging')
  }

  return sanitized
}

export function normalizeMobileBuildSourcePath(filePath: string) {
  const trimmed = filePath.trim().replace(/\\/g, '/')

  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('..')) {
    throw new Error(`Invalid mobile build source path: ${filePath}`)
  }

  const segments = trimmed.split('/').filter(Boolean)

  for (const segment of segments) {
    if (BLOCKED_PATH_SEGMENTS.has(segment)) {
      throw new Error(`Mobile build source cannot include ${segment}/ paths`)
    }
  }

  return segments.join('/')
}

export function validateMobileBuildSourceFiles(files: Record<string, string>) {
  const entries = Object.entries(files)

  if (!entries.length) {
    throw new Error('At least one project source file is required')
  }

  if (entries.length > MAX_MOBILE_BUILD_SOURCE_FILES) {
    throw new Error(`Mobile build source exceeds the ${MAX_MOBILE_BUILD_SOURCE_FILES} file limit`)
  }

  let totalBytes = 0
  const normalizedEntries: Array<[string, string]> = []

  for (const [rawPath, content] of entries) {
    const normalizedPath = normalizeMobileBuildSourcePath(rawPath)
    const bytes = Buffer.byteLength(content, 'utf8')

    if (bytes > MAX_MOBILE_BUILD_SOURCE_FILE_BYTES) {
      throw new Error(`Mobile build source file is too large: ${normalizedPath}`)
    }

    totalBytes += bytes
    normalizedEntries.push([normalizedPath, content])
  }

  if (totalBytes > MAX_MOBILE_BUILD_SOURCE_TOTAL_BYTES) {
    throw new Error('Mobile build source exceeds the total upload size limit')
  }

  const normalizedFiles = Object.fromEntries(normalizedEntries)
  const packageJson = normalizedFiles['package.json']

  if (!packageJson) {
    throw new Error('Mobile build source must include package.json')
  }

  let parsedPackage: Record<string, unknown> | null = null

  try {
    parsedPackage = JSON.parse(packageJson) as Record<string, unknown>
  } catch {
    throw new Error('Mobile build source package.json is invalid JSON')
  }

  const dependencies = {
    ...(parsedPackage.dependencies as Record<string, string> | undefined),
    ...(parsedPackage.devDependencies as Record<string, string> | undefined),
  }
  const isExpoProject =
    Boolean(dependencies.expo || dependencies['expo-router']) ||
    Boolean(
      normalizedFiles['app.json'] ||
        normalizedFiles['app.config.js'] ||
        normalizedFiles['app.config.ts'] ||
        normalizedFiles['app.config.mjs'],
    )

  if (!isExpoProject) {
    throw new Error('Mobile build source must be an Expo project (expo dependency or app config file)')
  }

  return {
    files: normalizedFiles,
    totalBytes,
  }
}

export function resolveMobileBuildSourceDirectory({
  buildId,
  projectRef,
}: {
  buildId: string
  projectRef: string
}) {
  return path.join(resolveMobileBuildSourceRoot(), sanitizeProjectRef(projectRef), buildId, 'app')
}

export async function stageMobileBuildSource({
  buildId,
  files,
  projectRef,
}: {
  buildId?: string
  files: Record<string, string>
  projectRef: string
}): Promise<StagedMobileBuildSource> {
  const { files: normalizedFiles, totalBytes } = validateMobileBuildSourceFiles(files)
  const effectiveBuildId = buildId?.trim() || randomUUID()
  const sourcePath = resolveMobileBuildSourceDirectory({
    buildId: effectiveBuildId,
    projectRef,
  })

  await rm(sourcePath, { recursive: true, force: true })
  await mkdir(sourcePath, { recursive: true })

  for (const [relativePath, content] of Object.entries(normalizedFiles)) {
    const destination = path.join(sourcePath, relativePath)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, content, 'utf8')
  }

  return {
    buildId: effectiveBuildId,
    fileCount: Object.keys(normalizedFiles).length,
    sourcePath,
    totalBytes,
  }
}
