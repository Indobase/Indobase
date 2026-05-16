/** Public docs base URL (no trailing slash). */
export const DOCS_SITE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DOCS_URL?.replace(/\/$/, '')) ||
  'https://indobase.in/docs'

export const STATUS_PAGE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_STATUS_PAGE_URL?.trim()) ||
  'https://studio.indobase.in/api/health/live'

export const GITHUB_ORG_REPO_URL = 'https://github.com/Indobase/Indobase'
