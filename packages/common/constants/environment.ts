/**
 * Legacy hosted platform API dashboard mode (disabled in Indobase).
 * Runtime value is always false (`NEXT_PUBLIC_IS_PLATFORM` is ignored).
 */
export const IS_PLATFORM: boolean = false
/**
 * Indobase multi-tenant product (orgs, billing, local `/api/platform/*` control plane).
 * Defaults on unless explicitly set to the string `"false"`.
 */
export const IS_INDOBASE_SAAS = process.env.NEXT_PUBLIC_INDOBASE_SAAS !== 'false'
/** Indobase SaaS dashboard (orgs, billing, local `/api/platform/*` control plane). */
export const IS_SAAS = IS_INDOBASE_SAAS

export const IS_PROD = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
