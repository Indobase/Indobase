export type PluginCategory = {
  id: number
  slug: string
  name: string
  description: string | null
}

export type PluginListing = {
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
  packageType: 'cursor_plugin' | 'mcp_server'
  sourceType: 'github_repo' | 'manifest_url' | 'mcp_endpoint'
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

export type PluginInstallResult = {
  listing: PluginListing
  install: {
    id: string
    listingId: string
    versionId: string | null
    organizationId: number | null
    projectRef: string | null
    installedByGotrueId: string | null
    client: string
    installStatus: string
    installPayload: Record<string, unknown>
    authorizationUrl: string | null
    authorizationCompletedAt: string | null
    installedAt: string | null
    insertedAt: string
    updatedAt: string
  } | null
  payload: {
    client: string
    serverName: string
    mcpUrl: string
    authorizeUrl: string | null
    clientPayload: Record<string, unknown>
  }
}

export type PluginDetail = {
  listing: PluginListing
  versions: PluginVersion[]
  reviews?: PluginReview[]
}
