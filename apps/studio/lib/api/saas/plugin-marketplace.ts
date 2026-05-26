import { Buffer } from 'node:buffer'
import type { JwtPayload } from 'indobase-js'

import { executeQuery } from './query'
import {
  type PluginPackageType,
  type PluginSourceType,
  validatePluginSource,
} from './plugin-marketplace-validation'
import { assertPlatformOperator } from './platform-operator'
import { getGotrueUserId } from './platform'

type Claims = JwtPayload & Record<string, unknown>

export type PluginCategory = {
  id: number
  slug: string
  name: string
  description: string | null
}

export type PluginListingSummary = {
  id: string
  organizationId: number
  organizationName: string
  organizationSlug: string
  oauthAppClientId: string | null
  oauthAppId: string | null
  oauthAuthorizeUrl: string | null
  oauthRedirectUri: string | null
  slug: string
  name: string
  summary: string
  descriptionMd: string
  website: string | null
  repoUrl: string | null
  packageType: PluginPackageType
  sourceType: PluginSourceType
  visibility: 'draft' | 'public' | 'unlisted' | 'archived'
  reviewStatus: 'draft' | 'submitted' | 'approved' | 'rejected' | 'changes_requested'
  pricingModel: 'free' | 'paid' | 'contact'
  logoUrl: string | null
  tags: string[]
  supportedClients: string[]
  supportedRuntimes: string[]
  installType: 'mcp' | 'plugin_repo' | 'hybrid'
  defaultMcpUrl: string | null
  defaultMcpServerName: string | null
  sourceMetadata: Record<string, unknown>
  latestValidationStatus: 'pending' | 'valid' | 'invalid'
  latestVersionId: string | null
  latestVersion: string | null
  publishedVersionId: string | null
  publishedVersion: string | null
  publishedAt: string | null
  insertedAt: string
  updatedAt: string
  categories: PluginCategory[]
  installCount: number
}

export type PluginVersion = {
  id: string
  listingId: string
  version: string
  changelog: string | null
  sourceRef: string | null
  manifestPath: string
  readmePath: string
  mcpPath: string | null
  packageMetadata: Record<string, unknown>
  manifestJson: Record<string, unknown> | null
  packageFiles: string[]
  validationStatus: 'pending' | 'valid' | 'invalid'
  validationErrors: string[]
  validationWarnings: string[]
  reviewStatus: 'draft' | 'submitted' | 'approved' | 'rejected' | 'changes_requested'
  reviewedByGotrueId: string | null
  reviewedAt: string | null
  insertedAt: string
  updatedAt: string
}

export type PluginReview = {
  id: string
  listingId: string
  versionId: string | null
  reviewerGotrueId: string | null
  status: 'submitted' | 'approved' | 'rejected' | 'changes_requested'
  notes: string | null
  metadata: Record<string, unknown>
  insertedAt: string
}

export type PluginInstall = {
  id: string
  listingId: string
  versionId: string | null
  organizationId: number | null
  projectRef: string | null
  installedByGotrueId: string | null
  client: string
  installStatus: 'requested' | 'authorized' | 'installed' | 'failed' | 'revoked'
  installPayload: Record<string, unknown>
  authorizationUrl: string | null
  authorizationCompletedAt: string | null
  installedAt: string | null
  insertedAt: string
  updatedAt: string
}

type CreatePluginListingBody = {
  oauthAppId?: string | null
  oauthAppClientId?: string | null
  oauthAuthorizeUrl?: string | null
  oauthRedirectUri?: string | null
  slug: string
  name: string
  summary: string
  descriptionMd?: string
  website?: string | null
  repoUrl?: string | null
  packageType: PluginPackageType
  sourceType: PluginSourceType
  visibility?: 'draft' | 'public' | 'unlisted' | 'archived'
  pricingModel?: 'free' | 'paid' | 'contact'
  logoUrl?: string | null
  tags?: string[]
  supportedClients?: string[]
  supportedRuntimes?: string[]
  installType?: 'mcp' | 'plugin_repo' | 'hybrid'
  defaultMcpUrl?: string | null
  defaultMcpServerName?: string | null
  sourceRef?: string | null
  version: string
  changelog?: string | null
  categories?: string[]
  manifestPath?: string | null
  mcpPath?: string | null
  submitForReview?: boolean
}

type UpdatePluginListingBody = Partial<CreatePluginListingBody> & {
  categories?: string[]
}

type CreatePluginVersionBody = {
  repoUrl?: string | null
  packageType: PluginPackageType
  sourceType: PluginSourceType
  defaultMcpUrl?: string | null
  defaultMcpServerName?: string | null
  sourceRef?: string | null
  version: string
  changelog?: string | null
  manifestPath?: string | null
  mcpPath?: string | null
  submitForReview?: boolean
}

type ReviewPluginBody = {
  versionId?: string | null
  status: 'approved' | 'rejected' | 'changes_requested'
  notes?: string | null
  publishVisibility?: 'public' | 'unlisted' | 'draft'
}

type GenerateInstallPayloadBody = {
  client?: 'cursor' | 'claude-code'
  organizationSlug?: string | null
  projectRef?: string | null
  readOnly?: boolean
  features?: string[]
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  if (Array.isArray(value) || typeof value === 'object') return value as T
  return fallback
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value === 'string') return parseJsonValue<string[]>(value, [])
  return []
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function requireNonEmpty(value: string | null | undefined, label: string) {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  return trimmed
}

function coerceJsonObject(value: unknown): Record<string, unknown> {
  const parsed = parseJsonValue<Record<string, unknown>>(value, {})
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

function mapListingRow(row: Record<string, unknown>): PluginListingSummary {
  return {
    id: String(row.id),
    organizationId: Number(row.organization_id),
    organizationName: String(row.organization_name ?? ''),
    organizationSlug: String(row.organization_slug ?? ''),
    oauthAppClientId: row.oauth_app_client_id ? String(row.oauth_app_client_id) : null,
    oauthAppId: row.oauth_app_id ? String(row.oauth_app_id) : null,
    oauthAuthorizeUrl: row.oauth_authorize_url ? String(row.oauth_authorize_url) : null,
    oauthRedirectUri: row.oauth_redirect_uri ? String(row.oauth_redirect_uri) : null,
    slug: String(row.slug),
    name: String(row.name),
    summary: String(row.summary ?? ''),
    descriptionMd: String(row.description_md ?? ''),
    website: row.website ? String(row.website) : null,
    repoUrl: row.repo_url ? String(row.repo_url) : null,
    packageType: String(row.package_type) as PluginPackageType,
    sourceType: String(row.source_type) as PluginSourceType,
    visibility: String(row.visibility) as PluginListingSummary['visibility'],
    reviewStatus: String(row.review_status) as PluginListingSummary['reviewStatus'],
    pricingModel: String(row.pricing_model) as PluginListingSummary['pricingModel'],
    logoUrl: row.logo_url ? String(row.logo_url) : null,
    tags: coerceStringArray(row.tags),
    supportedClients: coerceStringArray(row.supported_clients),
    supportedRuntimes: coerceStringArray(row.supported_runtimes),
    installType: String(row.install_type) as PluginListingSummary['installType'],
    defaultMcpUrl: row.default_mcp_url ? String(row.default_mcp_url) : null,
    defaultMcpServerName: row.default_mcp_server_name ? String(row.default_mcp_server_name) : null,
    sourceMetadata: coerceJsonObject(row.source_metadata),
    latestValidationStatus: String(row.latest_validation_status) as PluginListingSummary['latestValidationStatus'],
    latestVersionId: row.latest_version_id ? String(row.latest_version_id) : null,
    latestVersion: row.latest_version ? String(row.latest_version) : null,
    publishedVersionId: row.published_version_id ? String(row.published_version_id) : null,
    publishedVersion: row.published_version ? String(row.published_version) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    insertedAt: String(row.inserted_at),
    updatedAt: String(row.updated_at),
    categories: parseJsonValue<PluginCategory[]>(row.categories, []),
    installCount: Number(row.install_count ?? 0),
  }
}

function mapVersionRow(row: Record<string, unknown>): PluginVersion {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    version: String(row.version),
    changelog: row.changelog ? String(row.changelog) : null,
    sourceRef: row.source_ref ? String(row.source_ref) : null,
    manifestPath: String(row.manifest_path),
    readmePath: String(row.readme_path),
    mcpPath: row.mcp_path ? String(row.mcp_path) : null,
    packageMetadata: coerceJsonObject(row.package_metadata),
    manifestJson: parseJsonValue<Record<string, unknown> | null>(row.manifest_json, null),
    packageFiles: parseJsonValue<string[]>(row.package_files, []),
    validationStatus: String(row.validation_status) as PluginVersion['validationStatus'],
    validationErrors: parseJsonValue<string[]>(row.validation_errors, []),
    validationWarnings: parseJsonValue<string[]>(row.validation_warnings, []),
    reviewStatus: String(row.review_status) as PluginVersion['reviewStatus'],
    reviewedByGotrueId: row.reviewed_by_gotrue_id ? String(row.reviewed_by_gotrue_id) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    insertedAt: String(row.inserted_at),
    updatedAt: String(row.updated_at),
  }
}

function mapReviewRow(row: Record<string, unknown>): PluginReview {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    versionId: row.version_id ? String(row.version_id) : null,
    reviewerGotrueId: row.reviewer_gotrue_id ? String(row.reviewer_gotrue_id) : null,
    status: String(row.status) as PluginReview['status'],
    notes: row.notes ? String(row.notes) : null,
    metadata: coerceJsonObject(row.metadata),
    insertedAt: String(row.inserted_at),
  }
}

function mapInstallRow(row: Record<string, unknown>): PluginInstall {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    versionId: row.version_id ? String(row.version_id) : null,
    organizationId: row.organization_id === null ? null : Number(row.organization_id),
    projectRef: row.project_ref ? String(row.project_ref) : null,
    installedByGotrueId: row.installed_by_gotrue_id ? String(row.installed_by_gotrue_id) : null,
    client: String(row.client),
    installStatus: String(row.install_status) as PluginInstall['installStatus'],
    installPayload: coerceJsonObject(row.install_payload),
    authorizationUrl: row.authorization_url ? String(row.authorization_url) : null,
    authorizationCompletedAt: row.authorization_completed_at
      ? String(row.authorization_completed_at)
      : null,
    installedAt: row.installed_at ? String(row.installed_at) : null,
    insertedAt: String(row.inserted_at),
    updatedAt: String(row.updated_at),
  }
}

async function resolveOrganizationForManager(slug: string, gotrueId: string) {
  const result = await executeQuery<{ id: number; name: string; slug: string }>({
    query: `
      select o.id, o.name, o.slug
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1
        and m.gotrue_id = $2
        and m.role = any ($3::text[])
      limit 1
    `,
    parameters: [slug, gotrueId, ['owner', 'admin']],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
  if (!result.data?.length) throw new Error('Organization not found or insufficient permissions')
  return result.data[0]
}

async function resolveOrganizationForMember(slug: string, gotrueId: string) {
  const result = await executeQuery<{ id: number; name: string; slug: string }>({
    query: `
      select o.id, o.name, o.slug
      from saas.organizations o
      join saas.organization_members m on m.organization_id = o.id
      where o.slug = $1
        and m.gotrue_id = $2
      limit 1
    `,
    parameters: [slug, gotrueId],
    actorId: gotrueId,
  })
  if (result.error) throw result.error
  if (!result.data?.length) throw new Error('Organization not found')
  return result.data[0]
}

async function resolveOrganizationBySlug(slug: string) {
  const result = await executeQuery<{ id: number; name: string; slug: string }>({
    query: `select id, name, slug from saas.organizations where slug = $1 limit 1`,
    parameters: [slug],
  })
  if (result.error) throw result.error
  return result.data?.[0] ?? null
}

async function resolveListingBySlug(slug: string, actorId?: string | null) {
  const result = await executeQuery<Record<string, unknown>>({
    query: `
      select
        l.id::text as id,
        l.organization_id,
        o.name as organization_name,
        o.slug as organization_slug,
        l.oauth_app_id,
        l.oauth_app_client_id,
        l.oauth_authorize_url,
        l.oauth_redirect_uri,
        l.slug,
        l.name,
        l.summary,
        l.description_md,
        l.website,
        l.repo_url,
        l.package_type,
        l.source_type,
        l.visibility,
        l.review_status,
        l.pricing_model,
        l.logo_url,
        l.tags,
        l.supported_clients,
        l.supported_runtimes,
        l.install_type,
        l.default_mcp_url,
        l.default_mcp_server_name,
        l.source_metadata,
        l.latest_validation_status,
        l.latest_version_id::text as latest_version_id,
        lv.version as latest_version,
        l.published_version_id::text as published_version_id,
        pv.version as published_version,
        l.published_at,
        l.inserted_at,
        l.updated_at,
        coalesce(
          json_agg(distinct jsonb_build_object(
            'id', c.id,
            'slug', c.slug,
            'name', c.name,
            'description', c.description
          )) filter (where c.id is not null),
          '[]'::json
        ) as categories,
        (
          select count(*)
          from saas.plugin_installs pi
          where pi.listing_id = l.id
            and pi.install_status in ('authorized', 'installed')
        )::bigint as install_count
      from saas.plugin_listings l
      join saas.organizations o on o.id = l.organization_id
      left join saas.plugin_versions lv on lv.id = l.latest_version_id
      left join saas.plugin_versions pv on pv.id = l.published_version_id
      left join saas.plugin_listing_categories plc on plc.listing_id = l.id
      left join saas.plugin_categories c on c.id = plc.category_id
      where l.slug = $1
      group by l.id, o.name, o.slug, lv.version, pv.version
      limit 1
    `,
    parameters: [slug],
    actorId: actorId || undefined,
  })
  if (result.error) throw result.error
  return result.data?.[0] ? mapListingRow(result.data[0]) : null
}

async function listVersionsByListingId(listingId: string, actorId?: string | null) {
  const result = await executeQuery<Record<string, unknown>>({
    query: `
      select
        id::text as id,
        listing_id::text as listing_id,
        version,
        changelog,
        source_ref,
        manifest_path,
        readme_path,
        mcp_path,
        package_metadata,
        manifest_json,
        package_files,
        validation_status,
        validation_errors,
        validation_warnings,
        review_status,
        reviewed_by_gotrue_id::text as reviewed_by_gotrue_id,
        reviewed_at,
        inserted_at,
        updated_at
      from saas.plugin_versions
      where listing_id = $1::uuid
      order by inserted_at desc
    `,
    parameters: [listingId],
    actorId: actorId || undefined,
  })
  if (result.error) throw result.error
  return (result.data ?? []).map(mapVersionRow)
}

async function listReviewsByListingId(listingId: string, actorId?: string | null) {
  const result = await executeQuery<Record<string, unknown>>({
    query: `
      select
        id::text as id,
        listing_id::text as listing_id,
        version_id::text as version_id,
        reviewer_gotrue_id::text as reviewer_gotrue_id,
        status,
        notes,
        metadata,
        inserted_at
      from saas.plugin_reviews
      where listing_id = $1::uuid
      order by inserted_at desc
    `,
    parameters: [listingId],
    actorId: actorId || undefined,
  })
  if (result.error) throw result.error
  return (result.data ?? []).map(mapReviewRow)
}

async function replaceListingCategories(listingId: string, categories: string[]) {
  await executeQuery({
    query: `delete from saas.plugin_listing_categories where listing_id = $1::uuid`,
    parameters: [listingId],
  })

  if (categories.length === 0) return

  const categoryResult = await executeQuery<{ id: number; slug: string }>({
    query: `
      select id, slug
      from saas.plugin_categories
      where slug = any ($1::text[])
    `,
    parameters: [categories],
  })
  if (categoryResult.error) throw categoryResult.error

  for (const category of categoryResult.data ?? []) {
    const insertResult = await executeQuery({
      query: `
        insert into saas.plugin_listing_categories (listing_id, category_id)
        values ($1::uuid, $2)
        on conflict do nothing
      `,
      parameters: [listingId, category.id],
    })
    if (insertResult.error) throw insertResult.error
  }
}

function makeCursorInstallPayload(serverName: string, mcpUrl: string) {
  const serverConfig = { url: mcpUrl }
  const base64Config = Buffer.from(JSON.stringify(serverConfig)).toString('base64')
  return {
    config: {
      mcpServers: {
        [serverName]: {
          url: mcpUrl,
        },
      },
    },
    deepLink: `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(
      serverName
    )}&config=${encodeURIComponent(base64Config)}`,
  }
}

function makeClaudeCodeInstallPayload(serverName: string, mcpUrl: string) {
  return {
    command: `claude mcp add --scope project --transport http ${serverName} "${mcpUrl}"`,
    verify: 'claude /mcp',
  }
}

function buildAuthorizeUrl(listing: PluginListingSummary, organizationSlug?: string | null) {
  const authorizeBase = listing.oauthAuthorizeUrl?.trim()
  const clientId = listing.oauthAppClientId?.trim()
  const redirectUri = listing.oauthRedirectUri?.trim()
  if (!authorizeBase || !clientId || !redirectUri) return null

  const url = new URL(authorizeBase)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  if (organizationSlug?.trim()) {
    url.searchParams.set('organization_slug', organizationSlug.trim())
  }
  return url.toString()
}

export async function listPluginCategories() {
  const result = await executeQuery<Record<string, unknown>>({
    query: `
      select id, slug, name, description
      from saas.plugin_categories
      order by name asc
    `,
  })
  if (result.error) throw result.error
  return (result.data ?? []).map((row) => ({
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
  }))
}

export async function listMarketplacePlugins({
  claims,
  search,
  category,
  limit = 24,
  offset = 0,
}: {
  claims?: Claims
  search?: string
  category?: string
  limit?: number
  offset?: number
}) {
  const actorId = claims ? getGotrueUserId(claims) : undefined
  const params: unknown[] = []
  const where: string[] = [`l.visibility = 'public'`, `l.review_status = 'approved'`]

  if (search?.trim()) {
    params.push(`%${search.trim()}%`)
    where.push(`(l.name ilike $${params.length} or l.summary ilike $${params.length} or l.slug ilike $${params.length})`)
  }

  if (category?.trim()) {
    params.push(category.trim())
    where.push(`
      exists (
        select 1
        from saas.plugin_listing_categories plc2
        join saas.plugin_categories c2 on c2.id = plc2.category_id
        where plc2.listing_id = l.id
          and c2.slug = $${params.length}
      )
    `)
  }

  params.push(Math.min(Math.max(limit, 1), 100))
  params.push(Math.max(offset, 0))

  const result = await executeQuery<Record<string, unknown>>({
    query: `
      select
        l.id::text as id,
        l.organization_id,
        o.name as organization_name,
        o.slug as organization_slug,
        l.oauth_app_id,
        l.oauth_app_client_id,
        l.oauth_authorize_url,
        l.oauth_redirect_uri,
        l.slug,
        l.name,
        l.summary,
        l.description_md,
        l.website,
        l.repo_url,
        l.package_type,
        l.source_type,
        l.visibility,
        l.review_status,
        l.pricing_model,
        l.logo_url,
        l.tags,
        l.supported_clients,
        l.supported_runtimes,
        l.install_type,
        l.default_mcp_url,
        l.default_mcp_server_name,
        l.source_metadata,
        l.latest_validation_status,
        l.latest_version_id::text as latest_version_id,
        lv.version as latest_version,
        l.published_version_id::text as published_version_id,
        pv.version as published_version,
        l.published_at,
        l.inserted_at,
        l.updated_at,
        coalesce(
          json_agg(distinct jsonb_build_object(
            'id', c.id,
            'slug', c.slug,
            'name', c.name,
            'description', c.description
          )) filter (where c.id is not null),
          '[]'::json
        ) as categories,
        (
          select count(*)
          from saas.plugin_installs pi
          where pi.listing_id = l.id
            and pi.install_status in ('authorized', 'installed')
        )::bigint as install_count
      from saas.plugin_listings l
      join saas.organizations o on o.id = l.organization_id
      left join saas.plugin_versions lv on lv.id = l.latest_version_id
      left join saas.plugin_versions pv on pv.id = l.published_version_id
      left join saas.plugin_listing_categories plc on plc.listing_id = l.id
      left join saas.plugin_categories c on c.id = plc.category_id
      where ${where.join(' and ')}
      group by l.id, o.name, o.slug, lv.version, pv.version
      order by coalesce(l.published_at, l.inserted_at) desc
      limit $${params.length - 1}
      offset $${params.length}
    `,
    parameters: params,
    actorId,
  })
  if (result.error) throw result.error
  return (result.data ?? []).map(mapListingRow)
}

export async function listOrganizationPlugins({
  claims,
  slug,
}: {
  claims: Claims
  slug: string
}) {
  const actorId = getGotrueUserId(claims)
  await resolveOrganizationForMember(slug, actorId)

  const result = await executeQuery<Record<string, unknown>>({
    query: `
      select
        l.id::text as id,
        l.organization_id,
        o.name as organization_name,
        o.slug as organization_slug,
        l.oauth_app_id,
        l.oauth_app_client_id,
        l.oauth_authorize_url,
        l.oauth_redirect_uri,
        l.slug,
        l.name,
        l.summary,
        l.description_md,
        l.website,
        l.repo_url,
        l.package_type,
        l.source_type,
        l.visibility,
        l.review_status,
        l.pricing_model,
        l.logo_url,
        l.tags,
        l.supported_clients,
        l.supported_runtimes,
        l.install_type,
        l.default_mcp_url,
        l.default_mcp_server_name,
        l.source_metadata,
        l.latest_validation_status,
        l.latest_version_id::text as latest_version_id,
        lv.version as latest_version,
        l.published_version_id::text as published_version_id,
        pv.version as published_version,
        l.published_at,
        l.inserted_at,
        l.updated_at,
        coalesce(
          json_agg(distinct jsonb_build_object(
            'id', c.id,
            'slug', c.slug,
            'name', c.name,
            'description', c.description
          )) filter (where c.id is not null),
          '[]'::json
        ) as categories,
        (
          select count(*)
          from saas.plugin_installs pi
          where pi.listing_id = l.id
        )::bigint as install_count
      from saas.plugin_listings l
      join saas.organizations o on o.id = l.organization_id
      left join saas.plugin_versions lv on lv.id = l.latest_version_id
      left join saas.plugin_versions pv on pv.id = l.published_version_id
      left join saas.plugin_listing_categories plc on plc.listing_id = l.id
      left join saas.plugin_categories c on c.id = plc.category_id
      where o.slug = $1
      group by l.id, o.name, o.slug, lv.version, pv.version
      order by l.updated_at desc
    `,
    parameters: [slug],
    actorId,
  })
  if (result.error) throw result.error
  return (result.data ?? []).map(mapListingRow)
}

export async function getPluginListingDetail({
  claims,
  slug,
}: {
  claims: Claims
  slug: string
}) {
  const actorId = getGotrueUserId(claims)
  const listing = await resolveListingBySlug(slug, actorId)
  if (!listing) throw new Error('Plugin listing not found')
  const [versions, reviews] = await Promise.all([
    listVersionsByListingId(listing.id, actorId),
    listReviewsByListingId(listing.id, actorId),
  ])
  return { listing, versions, reviews }
}

export async function getPublicPluginDetail({
  claims,
  slug,
}: {
  claims?: Claims
  slug: string
}) {
  const actorId = claims ? getGotrueUserId(claims) : undefined
  const listing = await resolveListingBySlug(slug, actorId)
  if (!listing) throw new Error('Plugin listing not found')
  const versions = await listVersionsByListingId(listing.id, actorId)
  return { listing, versions }
}

export async function createOrganizationPluginListing({
  claims,
  organizationSlug,
  body,
}: {
  claims: Claims
  organizationSlug: string
  body: CreatePluginListingBody
}) {
  const actorId = getGotrueUserId(claims)
  const organization = await resolveOrganizationForManager(organizationSlug, actorId)
  const slug = normalizeSlug(requireNonEmpty(body.slug, 'Plugin slug'))
  const name = requireNonEmpty(body.name, 'Plugin name')
  const summary = requireNonEmpty(body.summary, 'Plugin summary')
  const version = requireNonEmpty(body.version, 'Version')

  const validation = await validatePluginSource({
    packageType: body.packageType,
    sourceType: body.sourceType,
    repoUrl: body.repoUrl,
    manifestPath: body.manifestPath,
    mcpPath: body.mcpPath,
    defaultMcpUrl: body.defaultMcpUrl,
  })

  const reviewStatus = body.submitForReview ? 'submitted' : 'draft'
  const listingInsert = await executeQuery<{ id: string }>({
    query: `
      insert into saas.plugin_listings (
        organization_id,
        oauth_app_id,
        oauth_app_client_id,
        oauth_authorize_url,
        oauth_redirect_uri,
        slug,
        name,
        summary,
        description_md,
        website,
        repo_url,
        package_type,
        source_type,
        visibility,
        review_status,
        pricing_model,
        logo_url,
        tags,
        supported_clients,
        supported_runtimes,
        install_type,
        default_mcp_url,
        default_mcp_server_name,
        source_metadata,
        latest_validation_status
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18::text[],
        $19::text[], $20::text[], $21, $22, $23, $24::jsonb, $25
      )
      returning id::text as id
    `,
    parameters: [
      organization.id,
      body.oauthAppId?.trim() || null,
      body.oauthAppClientId?.trim() || null,
      body.oauthAuthorizeUrl?.trim() || null,
      body.oauthRedirectUri?.trim() || null,
      slug,
      name,
      summary,
      body.descriptionMd?.trim() || '',
      body.website?.trim() || null,
      body.repoUrl?.trim() || null,
      body.packageType,
      body.sourceType,
      body.visibility || 'draft',
      reviewStatus,
      body.pricingModel || 'free',
      body.logoUrl?.trim() || null,
      body.tags ?? [],
      body.supportedClients ?? [],
      body.supportedRuntimes ?? [],
      body.installType || 'mcp',
      validation.derivedInstall.defaultMcpUrl || body.defaultMcpUrl?.trim() || null,
      validation.derivedInstall.defaultMcpServerName ||
        body.defaultMcpServerName?.trim() ||
        slug,
      JSON.stringify(validation.packageMetadata),
      validation.validationStatus,
    ],
    actorId,
  })
  if (listingInsert.error) throw listingInsert.error
  const listingId = listingInsert.data?.[0]?.id
  if (!listingId) throw new Error('Failed to create plugin listing')

  const versionInsert = await executeQuery<{ id: string }>({
    query: `
      insert into saas.plugin_versions (
        listing_id,
        version,
        changelog,
        source_ref,
        manifest_path,
        readme_path,
        mcp_path,
        package_metadata,
        manifest_json,
        package_files,
        validation_status,
        validation_errors,
        validation_warnings,
        review_status
      ) values (
        $1::uuid, $2, $3, $4, $5, $6, $7,
        $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13::jsonb, $14
      )
      returning id::text as id
    `,
    parameters: [
      listingId,
      version,
      body.changelog?.trim() || null,
      body.sourceRef?.trim() || null,
      validation.derivedInstall.manifestPath || body.manifestPath?.trim() || '.cursor-plugin/plugin.json',
      validation.derivedInstall.readmePath || 'README.md',
      validation.derivedInstall.mcpPath || body.mcpPath?.trim() || null,
      JSON.stringify(validation.packageMetadata),
      validation.manifestJson ? JSON.stringify(validation.manifestJson) : null,
      JSON.stringify(validation.packageFiles),
      validation.validationStatus,
      JSON.stringify(validation.errors),
      JSON.stringify(validation.warnings),
      reviewStatus,
    ],
    actorId,
  })
  if (versionInsert.error) throw versionInsert.error
  const versionId = versionInsert.data?.[0]?.id
  if (!versionId) throw new Error('Failed to create plugin version')

  const listingUpdate = await executeQuery({
    query: `
      update saas.plugin_listings
      set
        latest_version_id = $2::uuid,
        updated_at = now()
      where id = $1::uuid
    `,
    parameters: [listingId, versionId],
    actorId,
  })
  if (listingUpdate.error) throw listingUpdate.error

  await replaceListingCategories(listingId, body.categories ?? [])

  if (body.logoUrl?.trim()) {
    await executeQuery({
      query: `
        insert into saas.plugin_assets (listing_id, version_id, asset_type, url, metadata)
        values ($1::uuid, $2::uuid, 'logo', $3, $4::jsonb)
      `,
      parameters: [listingId, versionId, body.logoUrl.trim(), JSON.stringify({ source: 'listing' })],
      actorId,
    })
  }

  if (body.submitForReview) {
    await executeQuery({
      query: `
        insert into saas.plugin_reviews (listing_id, version_id, reviewer_gotrue_id, status, notes, metadata)
        values ($1::uuid, $2::uuid, $3::uuid, 'submitted', $4, $5::jsonb)
      `,
      parameters: [
        listingId,
        versionId,
        actorId,
        null,
        JSON.stringify({ submitted_by: actorId }),
      ],
      actorId,
    })
  }

  return getPluginListingDetail({ claims, slug })
}

export async function updateOrganizationPluginListing({
  claims,
  organizationSlug,
  slug,
  body,
}: {
  claims: Claims
  organizationSlug: string
  slug: string
  body: UpdatePluginListingBody
}) {
  const actorId = getGotrueUserId(claims)
  const organization = await resolveOrganizationForManager(organizationSlug, actorId)
  const existing = await resolveListingBySlug(slug, actorId)
  if (!existing || existing.organizationId !== organization.id) {
    throw new Error('Plugin listing not found')
  }

  const nextSlug = body.slug ? normalizeSlug(body.slug) : existing.slug

  const update = await executeQuery({
    query: `
      update saas.plugin_listings
      set
        slug = $2,
        name = $3,
        summary = $4,
        description_md = $5,
        website = $6,
        oauth_app_id = $7,
        oauth_app_client_id = $8,
        oauth_authorize_url = $9,
        oauth_redirect_uri = $10,
        repo_url = $11,
        visibility = $12,
        pricing_model = $13,
        logo_url = $14,
        tags = $15::text[],
        supported_clients = $16::text[],
        supported_runtimes = $17::text[],
        updated_at = now()
      where id = $1::uuid
    `,
    parameters: [
      existing.id,
      nextSlug,
      body.name?.trim() || existing.name,
      body.summary?.trim() || existing.summary,
      body.descriptionMd?.trim() ?? existing.descriptionMd,
      body.website?.trim() ?? existing.website,
      body.oauthAppId?.trim() ?? existing.oauthAppId,
      body.oauthAppClientId?.trim() ?? existing.oauthAppClientId,
      body.oauthAuthorizeUrl?.trim() ?? existing.oauthAuthorizeUrl,
      body.oauthRedirectUri?.trim() ?? existing.oauthRedirectUri,
      body.repoUrl?.trim() ?? existing.repoUrl,
      body.visibility ?? existing.visibility,
      body.pricingModel ?? existing.pricingModel,
      body.logoUrl?.trim() ?? existing.logoUrl,
      body.tags ?? existing.tags,
      body.supportedClients ?? existing.supportedClients,
      body.supportedRuntimes ?? existing.supportedRuntimes,
    ],
    actorId,
  })
  if (update.error) throw update.error

  if (body.categories) {
    await replaceListingCategories(existing.id, body.categories)
  }

  return getPluginListingDetail({ claims, slug: nextSlug })
}

export async function createPluginVersion({
  claims,
  organizationSlug,
  slug,
  body,
}: {
  claims: Claims
  organizationSlug: string
  slug: string
  body: CreatePluginVersionBody
}) {
  const actorId = getGotrueUserId(claims)
  const organization = await resolveOrganizationForManager(organizationSlug, actorId)
  const existing = await resolveListingBySlug(slug, actorId)
  if (!existing || existing.organizationId !== organization.id) {
    throw new Error('Plugin listing not found')
  }

  const validation = await validatePluginSource({
    packageType: body.packageType,
    sourceType: body.sourceType,
    repoUrl: body.repoUrl ?? existing.repoUrl,
    manifestPath: body.manifestPath,
    mcpPath: body.mcpPath,
    defaultMcpUrl: body.defaultMcpUrl ?? existing.defaultMcpUrl,
  })

  const reviewStatus = body.submitForReview ? 'submitted' : 'draft'
  const insert = await executeQuery<{ id: string }>({
    query: `
      insert into saas.plugin_versions (
        listing_id,
        version,
        changelog,
        source_ref,
        manifest_path,
        readme_path,
        mcp_path,
        package_metadata,
        manifest_json,
        package_files,
        validation_status,
        validation_errors,
        validation_warnings,
        review_status
      ) values (
        $1::uuid, $2, $3, $4, $5, $6, $7,
        $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13::jsonb, $14
      )
      returning id::text as id
    `,
    parameters: [
      existing.id,
      requireNonEmpty(body.version, 'Version'),
      body.changelog?.trim() || null,
      body.sourceRef?.trim() || null,
      validation.derivedInstall.manifestPath || body.manifestPath?.trim() || '.cursor-plugin/plugin.json',
      validation.derivedInstall.readmePath || 'README.md',
      validation.derivedInstall.mcpPath || body.mcpPath?.trim() || null,
      JSON.stringify(validation.packageMetadata),
      validation.manifestJson ? JSON.stringify(validation.manifestJson) : null,
      JSON.stringify(validation.packageFiles),
      validation.validationStatus,
      JSON.stringify(validation.errors),
      JSON.stringify(validation.warnings),
      reviewStatus,
    ],
    actorId,
  })
  if (insert.error) throw insert.error
  const versionId = insert.data?.[0]?.id
  if (!versionId) throw new Error('Failed to create plugin version')

  const update = await executeQuery({
    query: `
      update saas.plugin_listings
      set
        repo_url = $2,
        source_type = $3,
        package_type = $4,
        default_mcp_url = $5,
        default_mcp_server_name = $6,
        source_metadata = $7::jsonb,
        latest_validation_status = $8,
        latest_version_id = $9::uuid,
        review_status = $10,
        updated_at = now()
      where id = $1::uuid
    `,
    parameters: [
      existing.id,
      body.repoUrl?.trim() ?? existing.repoUrl,
      body.sourceType,
      body.packageType,
      validation.derivedInstall.defaultMcpUrl || body.defaultMcpUrl?.trim() || existing.defaultMcpUrl,
      validation.derivedInstall.defaultMcpServerName ||
        body.defaultMcpServerName?.trim() ||
        existing.defaultMcpServerName,
      JSON.stringify(validation.packageMetadata),
      validation.validationStatus,
      versionId,
      reviewStatus,
    ],
    actorId,
  })
  if (update.error) throw update.error

  if (body.submitForReview) {
    await executeQuery({
      query: `
        insert into saas.plugin_reviews (listing_id, version_id, reviewer_gotrue_id, status, notes, metadata)
        values ($1::uuid, $2::uuid, $3::uuid, 'submitted', $4, $5::jsonb)
      `,
      parameters: [
        existing.id,
        versionId,
        actorId,
        null,
        JSON.stringify({ submitted_by: actorId }),
      ],
      actorId,
    })
  }

  return getPluginListingDetail({ claims, slug })
}

export async function listAdminPluginReviewQueue({ claims }: { claims: Claims }) {
  assertPlatformOperator(claims)
  const result = await executeQuery<Record<string, unknown>>({
    query: `
      select
        l.id::text as id,
        l.organization_id,
        o.name as organization_name,
        o.slug as organization_slug,
        l.oauth_app_id,
        l.oauth_app_client_id,
        l.oauth_authorize_url,
        l.oauth_redirect_uri,
        l.slug,
        l.name,
        l.summary,
        l.description_md,
        l.website,
        l.repo_url,
        l.package_type,
        l.source_type,
        l.visibility,
        l.review_status,
        l.pricing_model,
        l.logo_url,
        l.tags,
        l.supported_clients,
        l.supported_runtimes,
        l.install_type,
        l.default_mcp_url,
        l.default_mcp_server_name,
        l.source_metadata,
        l.latest_validation_status,
        l.latest_version_id::text as latest_version_id,
        lv.version as latest_version,
        l.published_version_id::text as published_version_id,
        pv.version as published_version,
        l.published_at,
        l.inserted_at,
        l.updated_at,
        coalesce(
          json_agg(distinct jsonb_build_object(
            'id', c.id,
            'slug', c.slug,
            'name', c.name,
            'description', c.description
          )) filter (where c.id is not null),
          '[]'::json
        ) as categories,
        (
          select count(*)
          from saas.plugin_installs pi
          where pi.listing_id = l.id
        )::bigint as install_count
      from saas.plugin_listings l
      join saas.organizations o on o.id = l.organization_id
      left join saas.plugin_versions lv on lv.id = l.latest_version_id
      left join saas.plugin_versions pv on pv.id = l.published_version_id
      left join saas.plugin_listing_categories plc on plc.listing_id = l.id
      left join saas.plugin_categories c on c.id = plc.category_id
      where l.review_status in ('submitted', 'changes_requested', 'rejected')
         or exists (
           select 1 from saas.plugin_versions v
           where v.listing_id = l.id and v.review_status in ('submitted', 'changes_requested')
         )
      group by l.id, o.name, o.slug, lv.version, pv.version
      order by l.updated_at desc
    `,
  })
  if (result.error) throw result.error
  return (result.data ?? []).map(mapListingRow)
}

export async function reviewPluginListing({
  claims,
  slug,
  body,
}: {
  claims: Claims
  slug: string
  body: ReviewPluginBody
}) {
  assertPlatformOperator(claims)
  const reviewerId = getGotrueUserId(claims)
  const listing = await resolveListingBySlug(slug)
  if (!listing) throw new Error('Plugin listing not found')

  const targetVersionId = body.versionId?.trim() || listing.latestVersionId
  if (!targetVersionId) throw new Error('No version available for review')

  const versionUpdate = await executeQuery({
    query: `
      update saas.plugin_versions
      set
        review_status = $2,
        reviewed_by_gotrue_id = $3::uuid,
        reviewed_at = now(),
        updated_at = now()
      where id = $1::uuid
    `,
    parameters: [targetVersionId, body.status, reviewerId],
  })
  if (versionUpdate.error) throw versionUpdate.error

  const nextVisibility =
    body.status === 'approved' ? body.publishVisibility || (listing.visibility === 'draft' ? 'public' : listing.visibility) : listing.visibility

  const listingUpdate = await executeQuery({
    query: `
      update saas.plugin_listings
      set
        review_status = $2,
        visibility = $3,
        published_version_id = case when $2 = 'approved' then $4::uuid else published_version_id end,
        published_at = case when $2 = 'approved' then now() else published_at end,
        updated_at = now()
      where id = $1::uuid
    `,
    parameters: [listing.id, body.status, nextVisibility, targetVersionId],
  })
  if (listingUpdate.error) throw listingUpdate.error

  const reviewInsert = await executeQuery({
    query: `
      insert into saas.plugin_reviews (listing_id, version_id, reviewer_gotrue_id, status, notes, metadata)
      values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb)
    `,
    parameters: [
      listing.id,
      targetVersionId,
      reviewerId,
      body.status,
      body.notes?.trim() || null,
      JSON.stringify({ publishVisibility: body.publishVisibility || null }),
    ],
  })
  if (reviewInsert.error) throw reviewInsert.error

  return getPublicPluginDetail({ slug })
}

export async function generatePluginInstallPayload({
  claims,
  slug,
  body,
}: {
  claims: Claims
  slug: string
  body: GenerateInstallPayloadBody
}) {
  const actorId = getGotrueUserId(claims)
  const listing = await resolveListingBySlug(slug, actorId)
  if (!listing) throw new Error('Plugin listing not found')

  const versionId = listing.publishedVersionId || listing.latestVersionId
  if (!versionId) throw new Error('Plugin has no installable version')

  const client = body.client || 'cursor'
  const readOnly = body.readOnly !== false
  const features = (body.features ?? []).filter(Boolean)
  const baseUrl = requireNonEmpty(listing.defaultMcpUrl, 'Default MCP URL')
  const url = new URL(baseUrl)

  if (body.projectRef?.trim()) {
    url.searchParams.set('project_ref', body.projectRef.trim())
  }
  if (readOnly) {
    url.searchParams.set('read_only', 'true')
  } else {
    url.searchParams.delete('read_only')
  }
  if (features.length > 0) {
    url.searchParams.set('features', features.join(','))
  }

  const mcpUrl = url.toString()
  const serverName = listing.defaultMcpServerName || listing.slug
  const authorizeUrl = buildAuthorizeUrl(listing, body.organizationSlug)

  let clientPayload: Record<string, unknown>
  if (client === 'claude-code') {
    clientPayload = makeClaudeCodeInstallPayload(serverName, mcpUrl)
  } else {
    clientPayload = makeCursorInstallPayload(serverName, mcpUrl)
  }

  let organizationId: number | null = null
  if (body.organizationSlug?.trim()) {
    const organization = await resolveOrganizationBySlug(body.organizationSlug.trim())
    organizationId = organization?.id ?? null
  }

  const installInsert = await executeQuery<Record<string, unknown>>({
    query: `
      insert into saas.plugin_installs (
        listing_id,
        version_id,
        organization_id,
        project_ref,
        installed_by_gotrue_id,
        client,
        install_status,
        install_payload,
        authorization_url
      ) values (
        $1::uuid, $2::uuid, $3, $4, $5::uuid, $6, 'requested', $7::jsonb, $8
      )
      returning
        id::text as id,
        listing_id::text as listing_id,
        version_id::text as version_id,
        organization_id,
        project_ref,
        installed_by_gotrue_id::text as installed_by_gotrue_id,
        client,
        install_status,
        install_payload,
        authorization_url,
        authorization_completed_at,
        installed_at,
        inserted_at,
        updated_at
    `,
    parameters: [
      listing.id,
      versionId,
      organizationId,
      body.projectRef?.trim() || null,
      actorId,
      client,
      JSON.stringify({
        serverName,
        mcpUrl,
        client,
        clientPayload,
      }),
      authorizeUrl,
    ],
    actorId,
  })
  if (installInsert.error) throw installInsert.error
  const install = installInsert.data?.[0] ? mapInstallRow(installInsert.data[0]) : null

  return {
    listing,
    install,
    payload: {
      client,
      serverName,
      mcpUrl,
      authorizeUrl,
      clientPayload,
    },
  }
}
