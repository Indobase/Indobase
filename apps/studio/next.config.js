const { withSentryConfig } = require('@sentry/nextjs')
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})
// Required for nextjs standalone build
const path = require('path')

/** Marketing site (SvelteKit) — studio.indobase.in is Studio-only; pricing/docs live here. */
const MARKETING_SITE_URL = process.env.NEXT_PUBLIC_MARKETING_SITE_URL || 'https://indobase.in'

function getAssetPrefix() {
  // If not force enabled, but not production env, disable CDN
  if (process.env.FORCE_ASSET_CDN !== '1' && process.env.VERCEL_ENV !== 'production') {
    return undefined
  }

  // Force disable CDN
  if (process.env.FORCE_ASSET_CDN === '-1') {
    return undefined
  }

  const SUPABASE_ASSETS_URL =
    process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging'
      ? 'https://frontend-assets.indobase.green'
      : 'https://frontend-assets.indobase.fun'

  return `${SUPABASE_ASSETS_URL}/${process.env.SITE_NAME}/${process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 12)}`
}

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  assetPrefix: getAssetPrefix(),
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [
      // Make Studio work under /dashboard without requiring basePath at build time
      { source: '/dashboard/_next/:path*', destination: '/_next/:path*' },
      { source: '/dashboard/api/:path*', destination: '/api/:path*' },
      { source: '/dashboard/:path*', destination: '/:path*' },

      {
        source: `/.well-known/vercel/flags`,
        destination: `https://indobase.in/.well-known/vercel/flags`,
        basePath: false,
      },
    ]
  },
  async redirects() {
    const marketing = MARKETING_SITE_URL.replace(/\/$/, '')
    return [
      // Marketing lives on indobase.in — avoid broken www SPA merges on the Studio host
      { source: '/pricing', destination: `${marketing}/pricing`, permanent: false },
      { source: '/terms', destination: `${marketing}/terms`, permanent: false },
      { source: '/privacy', destination: `${marketing}/privacy`, permanent: false },
      { source: '/contact-us', destination: `${marketing}/contact-us`, permanent: false },
      {
        source: '/contact-us/enterprise',
        destination: `${marketing}/contact-us/enterprise`,
        permanent: false,
      },
      { source: '/docs', destination: `${marketing}/docs`, permanent: false },
      { source: '/docs/:path*', destination: `${marketing}/docs/:path*`, permanent: false },
      { source: '/blog', destination: `${marketing}/blog`, permanent: false },
      { source: '/blog/:path*', destination: `${marketing}/blog/:path*`, permanent: false },

      // Studio entry points
      {
        source: '/dashboard',
        destination: '/dashboard/sign-in',
        permanent: false,
      },
      {
        source: '/',
        destination: '/sign-in',
        permanent: false,
      },
      {
        source: '/register',
        destination: '/sign-up',
        permanent: false,
      },
      {
        source: '/signup',
        destination: '/sign-up',
        permanent: false,
      },
      {
        source: '/signin',
        destination: '/sign-in',
        permanent: false,
      },
      {
        source: '/login',
        destination: '/sign-in',
        permanent: false,
      },
      {
        source: '/log-in',
        destination: '/sign-in',
        permanent: false,
      },
      {
        source: '/project/:ref/auth',
        destination: '/project/:ref/auth/users',
        permanent: true,
      },
      {
        source: '/project/:ref/auth/advanced',
        destination: '/project/:ref/auth/performance',
        permanent: true,
      },
      {
        source: '/project/:ref/database',
        destination: '/project/:ref/database/tables',
        permanent: true,
      },
      {
        source: '/project/:ref/database/graphiql',
        destination: '/project/:ref/api/graphiql',
        permanent: true,
      },
      {
        source: '/project/:ref/storage',
        destination: '/project/:ref/storage/files',
        permanent: true,
      },
      {
        source: '/project/:ref/storage/buckets',
        destination: '/project/:ref/storage/files',
        permanent: true,
      },
      {
        source: '/project/:ref/storage/policies',
        destination: '/project/:ref/storage/files/policies',
        permanent: true,
      },
      {
        source: '/project/:ref/storage/buckets/:bucketId',
        destination: '/project/:ref/storage/files/buckets/:bucketId',
        permanent: true,
      },
      {
        permanent: true,
        source: '/project/:ref/settings/api-keys/new',
        destination: '/project/:ref/settings/api-keys',
      },
      {
        source: '/project/:ref/settings/storage',
        destination: '/project/:ref/storage/files/settings',
        permanent: true,
      },
      {
        source: '/project/:ref/storage/settings',
        destination: '/project/:ref/storage/files/settings',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/database',
        destination: '/project/:ref/database/settings',
        permanent: true,
      },
      {
        source: '/project/:ref/settings',
        destination: '/project/:ref/settings/general',
        permanent: true,
      },
      {
        source: '/project/:ref/auth/settings',
        destination: '/project/:ref/auth/users',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/billing/subscription',
        has: [
          {
            type: 'query',
            key: 'panel',
            value: 'subscriptionPlan',
          },
        ],
        destination: '/org/_/billing?panel=subscriptionPlan',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/billing/subscription',
        has: [
          {
            type: 'query',
            key: 'panel',
            value: 'pitr',
          },
        ],
        destination: '/project/:ref/settings/addons?panel=pitr',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/billing/subscription',
        has: [
          {
            type: 'query',
            key: 'panel',
            value: 'computeInstance',
          },
        ],
        destination: '/project/:ref/settings/compute-and-disk',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/billing/subscription',
        has: [
          {
            type: 'query',
            key: 'panel',
            value: 'customDomain',
          },
        ],
        destination: '/project/:ref/settings/addons?panel=customDomain',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/billing/subscription',
        destination: '/org/_/billing',
        permanent: true,
      },
      {
        permanent: true,
        source: '/project/:ref/settings/jwt/signing-keys',
        destination: '/project/:ref/settings/jwt',
      },
      {
        source: '/project/:ref/database/api-logs',
        destination: '/project/:ref/logs/edge-logs',
        permanent: true,
      },
      {
        source: '/project/:ref/database/postgres-logs',
        destination: '/project/:ref/logs/postgres-logs',
        permanent: true,
      },
      {
        source: '/project/:ref/database/postgrest-logs',
        destination: '/project/:ref/logs/postgrest-logs',
        permanent: true,
      },
      {
        source: '/project/:ref/database/pgbouncer-logs',
        destination: '/project/:ref/logs/pooler-logs',
        permanent: true,
      },
      {
        source: '/project/:ref/logs/pgbouncer-logs',
        destination: '/project/:ref/logs/pooler-logs',
        permanent: true,
      },
      {
        source: '/project/:ref/database/realtime-logs',
        destination: '/project/:ref/logs/realtime-logs',
        permanent: true,
      },
      {
        source: '/project/:ref/storage/logs',
        destination: '/project/:ref/logs/storage-logs',
        permanent: true,
      },
      {
        source: '/project/:ref/auth/logs',
        destination: '/project/:ref/logs/auth-logs',
        permanent: true,
      },
      {
        source: '/project/:ref/logs-explorer',
        destination: '/project/:ref/logs/explorer',
        permanent: true,
      },
      {
        source: '/project/:ref/sql/templates',
        destination: '/project/:ref/sql',
        permanent: true,
      },
      {
        source: '/org/:slug/settings',
        destination: '/org/:slug/general',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/billing/update',
        destination: '/org/_/billing',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/billing/update/free',
        destination: '/org/_/billing',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/billing/update/pro',
        destination: '/org/_/billing',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/billing/update/team',
        destination: '/org/_/billing',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/billing/update/enterprise',
        destination: '/org/_/billing',
        permanent: true,
      },
      {
        permanent: true,
        source: '/project/:ref/reports/linter',
        destination: '/project/:ref/database/linter',
      },
      {
        permanent: true,
        source: '/project/:ref/reports',
        destination: '/project/:ref/observability',
      },
      {
        permanent: true,
        source: '/project/:ref/reports/:path*',
        destination: '/project/:ref/observability/:path*',
      },
      {
        permanent: true,
        source: '/project/:ref/query-performance',
        destination: '/project/:ref/observability/query-performance',
      },
      {
        permanent: true,
        source: '/project/:ref/advisors/query-performance',
        destination: '/project/:ref/observability/query-performance',
      },
      {
        permanent: true,
        source: '/project/:ref/database/query-performance',
        destination: '/project/:ref/observability/query-performance',
      },
      {
        permanent: true,
        source: '/project/:ref/auth/column-privileges',
        destination: '/project/:ref/database/column-privileges',
      },
      {
        permanent: true,
        source: '/project/:ref/database/linter',
        destination: '/project/:ref/database/security-advisor',
      },
      {
        permanent: true,
        source: '/project/:ref/database/security-advisor',
        destination: '/project/:ref/advisors/security',
      },
      {
        permanent: true,
        source: '/project/:ref/database/performance-advisor',
        destination: '/project/:ref/advisors/performance',
      },
      {
        permanent: true,
        source: '/project/:ref/database/webhooks',
        destination: '/project/:ref/integrations/webhooks/overview',
      },
      {
        permanent: true,
        source: '/project/:ref/database/wrappers',
        destination: '/project/:ref/integrations?category=wrapper',
      },
      {
        permanent: true,
        source: '/project/:ref/database/cron-jobs',
        destination: '/project/:ref/integrations/cron',
      },
      {
        permanent: true,
        source: '/project/:ref/api/graphiql',
        destination: '/project/:ref/integrations/graphiql',
      },
      {
        permanent: true,
        source: '/project/:ref/settings/vault/secrets',
        destination: '/project/:ref/integrations/vault/secrets',
      },
      {
        permanent: true,
        source: '/project/:ref/settings/vault/keys',
        destination: '/project/:ref/integrations/vault/keys',
      },
      {
        permanent: true,
        source: '/project/:ref/integrations/cron-jobs',
        destination: '/project/:ref/integrations/cron',
      },
      {
        permanent: true,
        source: '/project/:ref/settings/warehouse',
        destination: '/project/:ref/settings/general',
      },
      {
        permanent: true,
        source: '/project/:ref/settings/functions',
        destination: '/project/:ref/functions/secrets',
      },
      {
        source: '/org/:slug/invoices',
        destination: '/org/:slug/billing#invoices',
        permanent: true,
      },
      {
        source: '/projects',
        destination: '/organizations',
        permanent: false,
      },
      {
        source: '/project/:ref/settings/auth',
        destination: '/project/:ref/auth/providers',
        permanent: true,
      },
      {
        source: '/project/:ref/settings/api',
        destination: '/project/:ref/integrations/data_api/overview',
        permanent: false,
      },
      {
        source: '/project/:ref/api',
        destination: '/project/:ref/integrations/data_api/docs',
        permanent: false,
      },

      ...(process.env.NEXT_PUBLIC_BASE_PATH?.length
        ? [
            {
              source: '/',
              destination: process.env.NEXT_PUBLIC_BASE_PATH,
              basePath: false,
              permanent: false,
            },
          ]
        : []),

      ...(process.env.MAINTENANCE_MODE === 'true'
        ? [
            {
              source: '/((?!maintenance|img).*)', // Redirect all paths except /maintenance and /img
              destination: '/maintenance',
              permanent: false,
            },
          ]
        : [
            {
              source: '/maintenance',
              destination: '/',
              permanent: false,
            },
          ]),
    ]
  },
  async headers() {
    const shouldSetHsts =
      process.env.NODE_ENV === 'production' &&
      ((process.env.NEXT_PUBLIC_SITE_URL || '').startsWith('https://') ||
        (process.env.VERCEL === '1' && process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'))

    const { getCSP } = require('./csp.js')
    const contentSecurityPolicy = getCSP()

    const securityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Content-Security-Policy',
        value: contentSecurityPolicy,
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
      ...(shouldSetHsts
        ? [
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=31536000; includeSubDomains; preload',
            },
          ]
        : []),
    ]

    return [
      {
        source: '/(.*?)',
        headers: securityHeaders,
      },
      {
        source: '/.well-known/vercel/flags',
        headers: [
          {
            key: 'content-type',
            value: 'application/json',
          },
        ],
      },
      {
        source: '/img/:slug*',
        headers: [{ key: 'cache-control', value: 'public, max-age=2592000' }],
      },
      {
        source: '/favicon/:slug*',
        headers: [{ key: 'cache-control', value: 'public, max-age=86400' }],
      },
      {
        source: '/(.*).ts',
        headers: [{ key: 'content-type', value: 'text/typescript' }],
      },
    ]
  },
  images: {
    dangerouslyAllowSVG: false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'github.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '/u/*',
      },
      {
        protocol: 'https',
        hostname: 'api-frameworks.vercel.sh',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'vercel.com',
        port: '',
        pathname: '**',
      },
    ],
  },
  transpilePackages: [
    'ui',
    'ui-patterns',
    'common',
    'shared-data',
    'api-types',
    'icons',
    'libpg-query',
    'indobase-js',
  ],
  turbopack: {
    rules: {
      '*.md': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
      // special case for Deno libs to be loaded as a raw text. They're passed as raw text to the Monaco editor.
      'edge-runtime.d.ts': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
      'lib.deno.d.ts': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
  onDemandEntries: {
    maxInactiveAge: 24 * 60 * 60 * 1000,
    pagesBufferLength: 100,
  },
  typescript: {
    // Typechecking is run via GitHub Action only for efficiency
    // For production, we run typechecks separate from the build command (pnpm typecheck && pnpm build)
    ignoreBuildErrors: true,
  },
}

// Make sure adding Sentry options is the last code to run before exporting, to
// ensure that your source maps include changes from all other Webpack plugins
module.exports = withSentryConfig(withBundleAnalyzer(nextConfig), {
  silent: true,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  widenClientFileUpload: true,

  reactComponentAnnotation: {
    enabled: true,
  },

  hideSourceMaps: true,

  disableLogger: true,

  automaticVercelMonitors: true,
})
