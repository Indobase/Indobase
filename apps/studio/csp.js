const IS_INDOBASE_SAAS = process.env.NEXT_PUBLIC_INDOBASE_SAAS !== 'false'

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
  : ''
const SUPABASE_URL = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : ''
const GOTRUE_URL = process.env.NEXT_PUBLIC_GOTRUE_URL
  ? new URL(process.env.NEXT_PUBLIC_GOTRUE_URL).origin
  : ''
const INDOBASE_PROJECTS_URL = 'https://*.indobase.in https://*.storage.indobase.in'
const INDOBASE_PROJECTS_URL_WS = 'wss://*.indobase.in'
// Hostinger staging Studio/Builder (same CI image; runtime SITE_URL is .fun)
const INDOBASE_HOSTINGER_STAGING_URLS = 'https://studio.indobase.fun https://builder.indobase.fun'

// construct the URL for the Websocket Local URLs
let INDOBASE_LOCAL_PROJECTS_URL_WS = ''
if (SUPABASE_URL) {
  const url = new URL(SUPABASE_URL)
  const wsUrl = `${url.hostname}:${url.port}`
  INDOBASE_LOCAL_PROJECTS_URL_WS = `ws://${wsUrl} wss://${wsUrl}`
}

// Needed to test docs search in local dev
const INDOBASE_DOCS_PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : ''

// Needed to test docs content API in local dev
const INDOBASE_CONTENT_API_URL = process.env.NEXT_PUBLIC_CONTENT_API_URL
  ? new URL(process.env.NEXT_PUBLIC_CONTENT_API_URL).origin
  : ''

const isDevOrStaging =
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' ||
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'local' ||
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging'

const NIMBUS_STAGING_PROJECTS_URL = 'https://*.nmb-proj.com'
const NIMBUS_STAGING_PROJECTS_URL_WS = 'wss://*.nmb-proj.com'

const NIMBUS_PROD_PROJECTS_URL = process.env.NIMBUS_PROD_PROJECTS_URL || ''
const NIMBUS_PROD_PROJECTS_URL_WS = process.env.NIMBUS_PROD_PROJECTS_URL_WS || ''

const INDOBASE_STAGING_PROJECTS_URL = 'https://*.indobase.red https://*.storage.indobase.red'
const INDOBASE_STAGING_PROJECTS_URL_WS = 'wss://*.indobase.red'
const INDOBASE_COM_URL = IS_INDOBASE_SAAS ? '' : 'https://indobase.in'
const CLOUDFLARE_CDN_URL = 'https://cdnjs.cloudflare.com'
const HCAPTCHA_SUBDOMAINS_URL = 'https://*.hcaptcha.com'
const HCAPTCHA_ASSET_URL = 'https://newassets.hcaptcha.com'
const HCAPTCHA_JS_URL = 'https://js.hcaptcha.com'
const CONFIGCAT_URL = 'https://cdn-global.configcat.com'
const CONFIGCAT_PROXY_URL = IS_INDOBASE_SAAS
  ? ''
  : ['staging', 'local'].includes(process.env.NEXT_PUBLIC_ENVIRONMENT ?? '')
    ? 'https://configcat.indobase.green'
    : 'https://configcat.indobase.in'
const STRIPE_SUBDOMAINS_URL = 'https://*.stripe.com'
const STRIPE_JS_URL = 'https://js.stripe.com'
const STRIPE_NETWORK_URL = 'https://*.stripe.network'
const CLOUDFLARE_URL = 'https://www.cloudflare.com'
const VERCEL_URL = 'https://vercel.com'
const VERCEL_INSIGHTS_URL = 'https://*.vercel-insights.com'
const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_USER_CONTENT_URL = 'https://raw.githubusercontent.com'
const GITHUB_USER_AVATAR_URL = 'https://avatars.githubusercontent.com'
const GOOGLE_USER_AVATAR_URL = 'https://lh3.googleusercontent.com'

// Stape GTM proxy — Supabase-hosted; not used on Indobase SaaS.
const STAPE_URL = IS_INDOBASE_SAAS ? '' : 'https://ss.indobase.in'

const VERCEL_LIVE_URL = 'https://vercel.live'
const SENTRY_URL =
  'https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io'
const INDOBASE_ASSETS_URL = IS_INDOBASE_SAAS
  ? process.env.NEXT_PUBLIC_SITE_URL || 'https://studio.indobase.in'
  : process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging'
    ? 'https://frontend-assets.indobase.green'
    : 'https://frontend-assets.indobase.in'
const POSTHOG_URL = (() => {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (host) {
    try {
      return new URL(host).origin
    } catch {
      return host
    }
  }
  return 'https://us.i.posthog.com'
})()
const POSTHOG_ASSETS_URL = (() => {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (host?.includes('eu.i.posthog.com')) return 'https://eu-assets.i.posthog.com'
  if (host?.includes('us.i.posthog.com')) return 'https://us-assets.i.posthog.com'
  return 'https://us-assets.i.posthog.com'
})()
const POSTHOG_UI_URL = (() => {
  const host = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST
  if (host) {
    try {
      return new URL(host).origin
    } catch {
      return host
    }
  }
  return 'https://us.posthog.com'
})()

const USERCENTRICS_URLS = 'https://*.usercentrics.eu'
const USERCENTRICS_APP_URL = 'https://app.usercentrics.eu'

// used by vercel live preview
const PUSHER_URL = 'https://*.pusher.com'
const PUSHER_URL_WS = 'wss://*.pusher.com'

const GOOGLE_MAPS_API_URL = 'https://maps.googleapis.com'

module.exports.getCSP = function getCSP() {
  const include = (url) => (url ? [url] : [])

  const DEFAULT_SRC_URLS = [
    API_URL,
    SUPABASE_URL,
    GOTRUE_URL,
    INDOBASE_LOCAL_PROJECTS_URL_WS,
    INDOBASE_PROJECTS_URL,
    INDOBASE_PROJECTS_URL_WS,
    INDOBASE_HOSTINGER_STAGING_URLS,
    HCAPTCHA_SUBDOMAINS_URL,
    CONFIGCAT_URL,
    ...include(CONFIGCAT_PROXY_URL),
    STRIPE_SUBDOMAINS_URL,
    STRIPE_NETWORK_URL,
    CLOUDFLARE_URL,
    VERCEL_INSIGHTS_URL,
    GITHUB_API_URL,
    GITHUB_USER_CONTENT_URL,
    ...include(INDOBASE_ASSETS_URL),
    USERCENTRICS_URLS,
    ...include(STAPE_URL),
    GOOGLE_MAPS_API_URL,
    POSTHOG_URL,
    POSTHOG_ASSETS_URL,
    POSTHOG_UI_URL,
    ...(!!NIMBUS_PROD_PROJECTS_URL ? [NIMBUS_PROD_PROJECTS_URL, NIMBUS_PROD_PROJECTS_URL_WS] : []),
    CLOUDFLARE_CDN_URL,
  ].filter(Boolean)
  const SCRIPT_SRC_URLS = [
    CLOUDFLARE_CDN_URL,
    HCAPTCHA_JS_URL,
    STRIPE_JS_URL,
    ...include(INDOBASE_ASSETS_URL),
    ...include(STAPE_URL),
    POSTHOG_URL,
    POSTHOG_ASSETS_URL,
    POSTHOG_UI_URL,
  ].filter(Boolean)
  const FRAME_SRC_URLS = [
    HCAPTCHA_ASSET_URL,
    STRIPE_JS_URL,
    ...include(STAPE_URL),
    ...(isDevOrStaging ? [POSTHOG_URL, POSTHOG_UI_URL] : [POSTHOG_UI_URL]),
  ].filter(Boolean)
  const IMG_SRC_URLS = [
    SUPABASE_URL,
    ...include(INDOBASE_COM_URL),
    INDOBASE_PROJECTS_URL,
    GITHUB_USER_AVATAR_URL,
    GOOGLE_USER_AVATAR_URL,
    ...include(INDOBASE_ASSETS_URL),
    USERCENTRICS_APP_URL,
    ...include(STAPE_URL),
    ...(!!NIMBUS_PROD_PROJECTS_URL ? [NIMBUS_PROD_PROJECTS_URL, NIMBUS_PROD_PROJECTS_URL_WS] : []),
  ].filter(Boolean)
  const STYLE_SRC_URLS = [CLOUDFLARE_CDN_URL, ...include(INDOBASE_ASSETS_URL)].filter(Boolean)
  const FONT_SRC_URLS = [CLOUDFLARE_CDN_URL, ...include(INDOBASE_ASSETS_URL)].filter(Boolean)

  const defaultSrcDirective = [
    `default-src 'self'`,
    ...DEFAULT_SRC_URLS,
    ...(isDevOrStaging
      ? [
          INDOBASE_STAGING_PROJECTS_URL,
          INDOBASE_STAGING_PROJECTS_URL_WS,
          NIMBUS_STAGING_PROJECTS_URL,
          NIMBUS_STAGING_PROJECTS_URL_WS,
          VERCEL_LIVE_URL,
          INDOBASE_DOCS_PROJECT_URL,
          INDOBASE_CONTENT_API_URL,
        ]
      : []),
    PUSHER_URL_WS,
    SENTRY_URL,
  ].join(' ')

  const imgSrcDirective = [
    `img-src 'self'`,
    `blob:`,
    `data:`,
    ...IMG_SRC_URLS,
    ...(isDevOrStaging
      ? [INDOBASE_STAGING_PROJECTS_URL, NIMBUS_STAGING_PROJECTS_URL, VERCEL_URL]
      : []),
  ].join(' ')

  const scriptSrcDirective = [
    `script-src 'self'`,
    `'unsafe-eval'`,
    `'unsafe-inline'`,
    ...SCRIPT_SRC_URLS,
    VERCEL_LIVE_URL,
    PUSHER_URL,
    GOOGLE_MAPS_API_URL,
  ].join(' ')

  const frameSrcDirective = [`frame-src 'self'`, ...FRAME_SRC_URLS, VERCEL_LIVE_URL].join(' ')

  const styleSrcDirective = [
    `style-src 'self'`,
    `'unsafe-inline'`,
    ...STYLE_SRC_URLS,
    VERCEL_LIVE_URL,
  ].join(' ')

  const fontSrcDirective = [`font-src 'self'`, ...FONT_SRC_URLS, VERCEL_LIVE_URL].join(' ')

  const workerSrcDirective = [`worker-src 'self'`, `blob:`, `data:`].join(' ')

  const cspDirectives = [
    defaultSrcDirective,
    imgSrcDirective,
    scriptSrcDirective,
    frameSrcDirective,
    styleSrcDirective,
    fontSrcDirective,
    workerSrcDirective,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `block-all-mixed-content`,
    ...(process.env.NEXT_PUBLIC_ENVIRONMENT === 'prod' ? [`upgrade-insecure-requests`] : []),
  ]

  const csp = cspDirectives.join('; ') + ';'

  // Replace newline characters and spaces
  return csp.replace(/\s{2,}/g, ' ').trim()
}
