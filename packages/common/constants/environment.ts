export const IS_PLATFORM = process.env.NEXT_PUBLIC_IS_PLATFORM === 'true'
/** Indobase multi-tenant product image (billing/orgs UI) without hosted Supabase Platform API. */
export const IS_INDOBASE_SAAS = process.env.NEXT_PUBLIC_INDOBASE_SAAS === 'true'
/** Any managed multi-tenant dashboard mode: Supabase cloud or Indobase SaaS. */
export const IS_SAAS = IS_PLATFORM || IS_INDOBASE_SAAS
/** Self-hosted Studio with mandatory auth and org flows (Compose, etc.). */
export const ENABLE_SELF_HOSTED_AUTH = process.env.NEXT_PUBLIC_ENABLE_SELF_HOSTED_AUTH === 'true'
/**
 * Uses organizations, sign-in, and /org routes (not anonymous “open” Studio).
 * Cloud, Indobase SaaS, or self-hosted + auth.
 */
export const IS_MULTI_ORG_DASHBOARD = IS_SAAS || ENABLE_SELF_HOSTED_AUTH

export const IS_PROD = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
