// Ignore barrel file rule here since it's just exporting more constants
// eslint-disable-next-line barrel-files/avoid-re-export-all
export * from './infrastructure'

import { IS_INDOBASE_SAAS, IS_PLATFORM, IS_SAAS } from 'common'

export { IS_INDOBASE_SAAS, IS_PLATFORM, IS_SAAS }

/**
 * Indicates that the app is running in a test environment (E2E tests).
 * Set via NEXT_PUBLIC_NODE_ENV=test in the generateLocalEnv.js script.
 */
export const IS_TEST_ENV = process.env.NEXT_PUBLIC_NODE_ENV === 'test'

export const API_URL = (() => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  if (process.env.NODE_ENV === 'test') return 'http://localhost:3000/api'
  // Browser: must be an absolute URL — shared code (e.g. feature flags) uses `new URL(API_URL + ...)`.
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${basePath}/api`
  }
  if (!!process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}${basePath}/api`
  if (!!process.env.NEXT_PUBLIC_SITE_URL)
    return `${process.env.NEXT_PUBLIC_SITE_URL}${basePath}/api`
  return `${basePath}/api`
})()

export const PG_META_URL = process.env.STUDIO_PG_META_URL
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/**
 * @deprecated use DATETIME_FORMAT
 */
export const DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ'

// should be used for all dayjs formattings shown to the user. Includes timezone info.
export const DATETIME_FORMAT = 'DD MMM YYYY, HH:mm:ss (ZZ)'

export const GOTRUE_ERRORS = {
  UNVERIFIED_GITHUB_USER: 'Error sending confirmation mail',
}

export const STRIPE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || 'pk_test_XVwg5IZH3I9Gti98hZw6KRzd00v5858heG'

export const POSTHOG_URL =
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging' ||
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'local'
    ? 'https://ph.supabase.green'
    : 'https://ph.supabase.com'

export const USAGE_APPROACHING_THRESHOLD = 0.75

/**
 * Product docs base URL. Indobase docs site may not mirror all guides yet; on SaaS we fall back
 * to Supabase docs content so "Docs" buttons do not 404 until indobase.in/docs is fully published.
 */
export const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL ||
  (IS_SAAS ? 'https://supabase.com/docs' : 'https://indobase.in/docs')

export const OPT_IN_TAGS = {
  AI_SQL: 'AI_SQL_GENERATOR_OPT_IN',
  AI_DATA: 'AI_DATA_GENERATOR_OPT_IN',
  AI_LOG: 'AI_LOG_GENERATOR_OPT_IN',
}

export const GB = 1024 * 1024 * 1024
export const MB = 1024 * 1024
export const KB = 1024

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
