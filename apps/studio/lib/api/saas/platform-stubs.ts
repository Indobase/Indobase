import type { components } from 'api-types'

/**
 * PostHog feature flags for Indobase SaaS (no cloud telemetry backend).
 * Keys mirror Studio `usePHFlag` / critical UI gates; values are enabled unless noted.
 */
const SAAS_POSTHOG_FEATURE_FLAGS: Record<string, boolean | string> = {
  advisorRules: true,
  allowDataBranching: true,
  analyticsBucketsTableCreation: true,
  authOverviewPage: true,
  authreportv2: true,
  axiomLogDrain: true,
  edgefunctionreport: true,
  EnableOAuth21: true,
  enablecreatecommands: true,
  enableSearchEntitiesCommandMenu: true,
  enableSmartRegion: false,
  enableStripeSyncEngineIntegration: false,
  gitlessBranching: true,
  improvedUserSearch: true,
  Last9LogDrain: true,
  newEdgeFunctionOverviewCharts: true,
  newJwtSecrets: true,
  observabilityOverview: true,
  otlpLogDrain: true,
  postgrestreport: true,
  realtimeReport: true,
  realtimeReportEUAlert: false,
  redeemCodeEnabled: false,
  reportGranularityV2: true,
  S3logdrain: true,
  SentryLogDrain: true,
  ShowExplainWithAiInQueryPerformance: true,
  ShowPrettyExplain: true,
  simplifiedSupportForm: true,
  storageAnalyticsVector: true,
  storagereport: true,
  tableEditorNewFilterBar: true,
  unifiedLogs: true,
  unifiedReplication: true,
  connectSheet: true,
  homeNew: 'new-home',
  // Billing / cloud-only — keep off for self-hosted SaaS
  customDomainsDisabledDueToQuota: false,
  disableProjectCreationAndUpdate: false,
  disableProjectRestarts: false,
  disableProjectTransfer: false,
  disableProjectUpgrade: false,
  newHomepageUsageV2: false,
  ongoingIncident: false,
  proBenefitWording: false,
  showRefreshToast: false,
}

/**
 * ConfigCat flags for Studio `useFlag` when no ConfigCat proxy/SDK is configured.
 * Same keys as PostHog where applicable; boolean values only.
 */
const SAAS_CONFIGCAT_FEATURE_FLAGS: Record<string, boolean> = {
  advisorRules: true,
  allowDataBranching: true,
  analyticsBucketsTableCreation: true,
  authOverviewPage: true,
  authreportv2: true,
  awsPrivateLinkIntegration: false,
  axiomLogDrain: true,
  clockSkewBanner: false,
  customDomainsDisabledDueToQuota: false,
  defaultRegionRestrictedPool: false,
  disableAssistantPrompts: false,
  disableOrioleProjectCreation: false,
  disableProjectCreationAndUpdate: false,
  disableProjectRestarts: false,
  disableProjectTransfer: false,
  disableProjectUpgrade: false,
  edgefunctionreport: true,
  EnableOAuth21: true,
  enablecreatecommands: true,
  enableFlyCloudProvider: false,
  enableSearchEntitiesCommandMenu: true,
  enableSmartRegion: false,
  enableStripeSyncEngineIntegration: false,
  etlEnableBigQuery: false,
  etlEnableIceberg: false,
  etlPrivateAlpha: false,
  etlPrivateAlphaOverride: false,
  gitlessBranching: true,
  improvedUserSearch: true,
  isWorkOSTPAEnabled: false,
  Last9LogDrain: true,
  newEdgeFunctionOverviewCharts: true,
  newHomepageUsageV2: false,
  newJwtSecrets: true,
  observabilityOverview: true,
  ongoingIncident: false,
  otlpLogDrain: true,
  postgrestreport: true,
  realtimeReport: true,
  realtimeReportEUAlert: false,
  redeemCodeEnabled: false,
  reportGranularityV2: true,
  S3logdrain: true,
  scopedPAT: true,
  SentryLogDrain: true,
  ShowExplainWithAiInQueryPerformance: true,
  ShowIndexAdvisorOnTableEditor: true,
  ShowPrettyExplain: true,
  showApiKeysLastUsed: false,
  showNoticeBanner: false,
  showPostgresVersionSelector: true,
  showRefreshToast: false,
  simplifiedSupportForm: true,
  storageAnalyticsVector: true,
  storageMigrationCallout: false,
  storagereport: true,
  tableEditorNewFilterBar: true,
  textConfirmationModalClickToCopy: true,
  unifiedLogs: true,
  unifiedReplication: true,
  connectSheet: true,
  homeNew: true,
}

/** Default PostHog feature flags for Indobase SaaS (no cloud telemetry backend). */
export function defaultFeatureFlagsResponse(): components['schemas']['TelemetryCallFeatureFlagsResponse'] {
  return { ...SAAS_POSTHOG_FEATURE_FLAGS }
}

/** ConfigCat-shaped flag list for FeatureFlagProvider when ConfigCat is unavailable. */
export function getSaasStudioConfigCatFlagValues() {
  return Object.entries(SAAS_CONFIGCAT_FEATURE_FLAGS).map(([settingKey, settingValue]) => ({
    settingKey,
    settingValue,
  }))
}

export function defaultStorageConfigResponse(): components['schemas']['StorageConfigResponse'] {
  return {
    capabilities: {
      iceberg_catalog: false,
      list_v2: true,
    },
    databasePoolMode: 'transaction',
    external: { upstreamTarget: 'main' },
    features: {
      icebergCatalog: {
        enabled: true,
        maxCatalogs: 10,
        maxNamespaces: 100,
        maxTables: 1000,
      },
      imageTransformation: { enabled: true },
      s3Protocol: { enabled: true },
      vectorBuckets: { enabled: true, maxBuckets: 10, maxIndexes: 100 },
    },
    fileSizeLimit: 52_428_800,
    migrationVersion: 'indobase',
  }
}

export function defaultEntitlementsResponse(): components['schemas']['ListEntitlementsResponse'] {
  return {
    entitlements: [
      {
        feature: { key: 'branching_limit' },
        type: 'numeric',
        hasAccess: true,
        config: { enabled: true, unlimited: true, value: 50 },
      },
      {
        feature: { key: 'branching_persistent' },
        type: 'boolean',
        hasAccess: true,
        config: { enabled: true },
      },
      {
        feature: { key: 'assistant.advance_model' },
        type: 'boolean',
        hasAccess: true,
        config: { enabled: true },
      },
    ],
  } as components['schemas']['ListEntitlementsResponse']
}

export function defaultOrgUsageResponse(): components['schemas']['OrgUsageResponse'] {
  return {
    usage_billing_enabled: false,
    usages: [],
  }
}

/** No resource warnings on self-hosted SaaS (optional empty ok). */
export function defaultResourceWarningsResponse(): components['schemas']['ProjectResourceWarningsResponse'][] {
  return []
}
