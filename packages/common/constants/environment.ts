/**
 * Hosted Supabase Platform API dashboard (legacy upstream mode).
 * Indobase ships as SaaS only; runtime value is always false (`NEXT_PUBLIC_IS_PLATFORM` is ignored).
 */
export const IS_PLATFORM: boolean = false
/**
 * Indobase multi-tenant product (orgs, billing, local `/api/platform/*` control plane).
 * Defaults on unless explicitly set to the string `"false"`.
 */
export const IS_INDOBASE_SAAS = process.env.NEXT_PUBLIC_INDOBASE_SAAS !== 'false'
/** SaaS dashboard (Indobase); hosted Supabase Platform is not supported in this fork. */
export const IS_SAAS = IS_INDOBASE_SAAS

export const IS_PROD = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
