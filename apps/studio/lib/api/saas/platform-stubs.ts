import type { components } from 'api-types'

/** Default PostHog feature flags for Indobase SaaS (no cloud telemetry backend). */
export function defaultFeatureFlagsResponse(): components['schemas']['TelemetryCallFeatureFlagsResponse'] {
  return {}
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
        enabled: false,
        maxCatalogs: 0,
        maxNamespaces: 0,
        maxTables: 0,
      },
      imageTransformation: { enabled: true },
      s3Protocol: { enabled: true },
      vectorBuckets: { enabled: false, maxBuckets: 0, maxIndexes: 0 },
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
    ],
  } as components['schemas']['ListEntitlementsResponse']
}

export function defaultOrgUsageResponse(): components['schemas']['OrgUsageResponse'] {
  return {
    usage_billing_enabled: false,
    usages: [],
  }
}

export function defaultResourceWarningsResponse(): components['schemas']['ProjectResourceWarningsResponse'][] {
  return []
}
