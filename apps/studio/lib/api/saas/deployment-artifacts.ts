import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getStorageAdminClientForRef } from 'lib/api/storage-admin'
import { publishTenantSiteHosting } from './tenant-data-plane-provision'
import { updateProjectDeployment } from './deployments'
import { getProjectSettingsForRef } from './settings'

export const PROJECT_HOSTING_BUCKET = 'hosting'
export const MAX_DEPLOYMENT_ARTIFACT_FILES = 200
export const MAX_DEPLOYMENT_ARTIFACT_TOTAL_BYTES = 8 * 1024 * 1024
export const MAX_DEPLOYMENT_ARTIFACT_FILE_BYTES = 2 * 1024 * 1024

const TEXTUAL_ARTIFACT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.ico',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
])

export type DeploymentArtifactManifest = {
  bucket: string
  file_count: number
  index_path: string
  prefix: string
  published_url: string
  site_synced: boolean
  storage_url: string
  total_bytes: number
}

function normalizeArtifactPath(filePath: string) {
  const trimmed = filePath.trim().replace(/\\/g, '/')

  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('..')) {
    throw new Error(`Invalid deployment artifact path: ${filePath}`)
  }

  return trimmed
}

function guessArtifactContentType(filePath: string) {
  const lower = filePath.toLowerCase()

  if (lower.endsWith('.html')) return 'text/html; charset=utf-8'
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8'
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.webmanifest')) return 'application/manifest+json; charset=utf-8'
  if (lower.endsWith('.xml')) return 'application/xml; charset=utf-8'
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8'
  if (lower.endsWith('.ico')) return 'image/x-icon'

  return 'application/octet-stream'
}

function assertArtifactIsTextual(filePath: string) {
  const extension = filePath.includes('.') ? `.${filePath.split('.').pop()!.toLowerCase()}` : ''

  if (!TEXTUAL_ARTIFACT_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported deployment artifact type: ${filePath}`)
  }
}

export function validateDeploymentArtifacts(files: Record<string, string>) {
  const entries = Object.entries(files)

  if (!entries.length) {
    throw new Error('At least one deployment artifact is required')
  }

  if (entries.length > MAX_DEPLOYMENT_ARTIFACT_FILES) {
    throw new Error(`Deployment artifacts exceed the ${MAX_DEPLOYMENT_ARTIFACT_FILES} file limit`)
  }

  let totalBytes = 0

  for (const [rawPath, content] of entries) {
    const path = normalizeArtifactPath(rawPath)
    assertArtifactIsTextual(path)

    const bytes = Buffer.byteLength(content, 'utf8')
    if (bytes > MAX_DEPLOYMENT_ARTIFACT_FILE_BYTES) {
      throw new Error(`Deployment artifact is too large: ${path}`)
    }

    totalBytes += bytes
  }

  if (totalBytes > MAX_DEPLOYMENT_ARTIFACT_TOTAL_BYTES) {
    throw new Error('Deployment artifacts exceed the total upload size limit')
  }

  const normalizedEntries = entries.map(([rawPath, content]) => [normalizeArtifactPath(rawPath), content] as const)
  const hasIndexHtml = normalizedEntries.some(([path]) => path === 'index.html' || path.endsWith('/index.html'))

  if (!hasIndexHtml) {
    throw new Error('Deployment artifacts must include index.html')
  }

  return Object.fromEntries(normalizedEntries)
}

function resolveProjectApiOrigin(settings: NonNullable<Awaited<ReturnType<typeof getProjectSettingsForRef>>>) {
  const protocol = (settings.app_config?.protocol || 'https').replace(/:$/, '')
  const endpoint = settings.app_config?.endpoint?.trim()

  if (!endpoint) {
    throw new Error('Project API URL is missing')
  }

  return `${protocol}://${endpoint}`
}

export function resolveProjectSiteRootUrl(apiOrigin: string) {
  return `${apiOrigin.replace(/\/+$/, '')}/`
}

export function resolveDeploymentStorageUrl({
  apiOrigin,
  deploymentId,
  indexPath,
}: {
  apiOrigin: string
  deploymentId: string
  indexPath: string
}) {
  const prefix = `sites/${deploymentId}`
  const normalizedIndexPath = normalizeArtifactPath(indexPath)
  return `${apiOrigin.replace(/\/+$/, '')}/storage/v1/object/public/${PROJECT_HOSTING_BUCKET}/${prefix}/${normalizedIndexPath}`
}

async function ensureHostingBucket(client: Awaited<ReturnType<typeof getStorageAdminClientForRef>>) {
  const { data: buckets, error: listError } = await client.storage.listBuckets()

  if (listError) {
    throw new Error(listError.message || 'Failed to list storage buckets')
  }

  if (buckets?.some((bucket) => bucket.name === PROJECT_HOSTING_BUCKET)) {
    return
  }

  const { error: createError } = await client.storage.createBucket(PROJECT_HOSTING_BUCKET, {
    public: true,
  })

  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw new Error(createError.message || 'Failed to create hosting bucket')
  }
}

export async function publishDeploymentArtifacts({
  claims,
  deploymentId,
  files,
  ref,
}: {
  claims: JwtPayload
  deploymentId: string
  files: Record<string, string>
  ref: string
}): Promise<DeploymentArtifactManifest> {
  const normalizedFiles = validateDeploymentArtifacts(files)
  const settings = await getProjectSettingsForRef({ claims, ref })

  if (!settings) {
    throw new Error('Project not found')
  }

  const client = await getStorageAdminClientForRef(ref, claims)
  await ensureHostingBucket(client)

  const prefix = `sites/${deploymentId}`
  let totalBytes = 0
  let indexPath = 'index.html'

  for (const [path, content] of Object.entries(normalizedFiles)) {
    const storagePath = `${prefix}/${path}`
    const bytes = Buffer.byteLength(content, 'utf8')
    totalBytes += bytes

    if (path === 'index.html' || path.endsWith('/index.html')) {
      indexPath = path
    }

    const { error } = await client.storage.from(PROJECT_HOSTING_BUCKET).upload(storagePath, content, {
      contentType: guessArtifactContentType(path),
      upsert: true,
    })

    if (error) {
      throw new Error(error.message || `Failed to upload ${path}`)
    }
  }

  const apiOrigin = resolveProjectApiOrigin(settings)
  const storageUrl = resolveDeploymentStorageUrl({
    apiOrigin,
    deploymentId,
    indexPath,
  })
  const rootUrl = resolveProjectSiteRootUrl(apiOrigin)

  let siteSynced = false
  try {
    const sitePublish = await publishTenantSiteHosting({
      files: normalizedFiles,
      ref,
    })
    siteSynced = sitePublish.site_synced
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync site files to tenant nginx'
    throw new Error(message)
  }

  const publishedUrl = siteSynced ? rootUrl : storageUrl

  const manifest: DeploymentArtifactManifest = {
    bucket: PROJECT_HOSTING_BUCKET,
    file_count: Object.keys(normalizedFiles).length,
    index_path: indexPath,
    prefix,
    published_url: publishedUrl,
    site_synced: siteSynced,
    storage_url: storageUrl,
    total_bytes: totalBytes,
  }

  await updateProjectDeployment({
    deploymentId,
    logMessage: siteSynced
      ? `Published ${manifest.file_count} site files to ${PROJECT_HOSTING_BUCKET} storage and tenant nginx`
      : `Published ${manifest.file_count} site files to ${PROJECT_HOSTING_BUCKET} storage`,
    metadataPatch: {
      hosting_artifacts: manifest,
    },
    ref,
    source: 'builder',
    targetUrl: publishedUrl,
  })

  return manifest
}
