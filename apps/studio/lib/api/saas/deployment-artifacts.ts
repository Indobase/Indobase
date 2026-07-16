import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getStorageAdminClientForRef } from 'lib/api/storage-admin'
import { publishTenantSiteHosting, registerTenantSiteRoute } from './tenant-data-plane-provision'
import { getProjectDeployment, updateProjectDeployment, type ProjectDeployment } from './deployments'
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
  route_registered: boolean
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

export type PublishDeploymentArtifactsResult = {
  deployment: ProjectDeployment
  manifest: DeploymentArtifactManifest
}

async function finalizePublishedDeployment({
  claims,
  deploymentId,
  manifest,
  publishedUrl,
  ref,
}: {
  claims: JwtPayload
  deploymentId: string
  manifest: DeploymentArtifactManifest
  publishedUrl: string
  ref: string
}): Promise<ProjectDeployment> {
  const existing = await getProjectDeployment({ claims, deploymentId, ref })

  if (!existing) {
    throw new Error('Deployment not found')
  }

  if (existing.status === 'requested') {
    await updateProjectDeployment({
      deploymentId,
      logMessage: 'Publishing site artifacts from Builder',
      ref,
      source: 'builder',
      status: 'building',
    })
  }

  return updateProjectDeployment({
    deploymentId,
    logMessage: `Published ${manifest.file_count} site files (${manifest.total_bytes} bytes)`,
    metadataPatch: {
      hosting_artifacts: manifest,
    },
    ref,
    source: 'builder',
    status: 'ready',
    targetUrl: publishedUrl,
  })
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
}): Promise<PublishDeploymentArtifactsResult> {
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

  const { getOrganizationPlanByProjectRef } = await import('./plan-metering')
  const { applyIndobaseBadgeToHtml } = await import('./plan-badge')
  const orgPlan = await getOrganizationPlanByProjectRef(ref)

  for (const [path, content] of Object.entries(normalizedFiles)) {
    const storagePath = `${prefix}/${path}`
    let uploadContent = content

    if (path === 'index.html' || path.endsWith('/index.html')) {
      indexPath = path
      uploadContent = applyIndobaseBadgeToHtml(content, orgPlan)
    }

    const bytes = Buffer.byteLength(uploadContent, 'utf8')
    totalBytes += bytes

    const { error } = await client.storage.from(PROJECT_HOSTING_BUCKET).upload(storagePath, uploadContent, {
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

  let routeRegistered = false
  let siteSynced = false

  try {
    const routeResult = await registerTenantSiteRoute({
      ref,
      deploymentId,
      prefix,
    })
    routeRegistered = Boolean(routeResult.route_registered)
  } catch (error) {
    console.warn(
      '[deployment-artifacts] storage-first site route registration failed for %s: %s',
      ref,
      error instanceof Error ? error.message : String(error)
    )
  }

  if (!routeRegistered) {
    try {
      const sitePublish = await publishTenantSiteHosting({
        files: normalizedFiles,
        ref,
      })
      siteSynced = sitePublish.site_synced
    } catch (error) {
      console.warn(
        '[deployment-artifacts] nginx site publish failed for %s: %s',
        ref,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  const publishedUrl = routeRegistered || siteSynced ? rootUrl : storageUrl

  const manifest: DeploymentArtifactManifest = {
    bucket: PROJECT_HOSTING_BUCKET,
    file_count: Object.keys(normalizedFiles).length,
    index_path: indexPath,
    prefix,
    published_url: publishedUrl,
    route_registered: routeRegistered,
    site_synced: siteSynced,
    storage_url: storageUrl,
    total_bytes: totalBytes,
  }

  const deployment = await finalizePublishedDeployment({
    claims,
    deploymentId,
    manifest,
    publishedUrl,
    ref,
  })

  return { deployment, manifest }
}
