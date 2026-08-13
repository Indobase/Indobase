/**
 * Classify operator intent once. The production job owns every stage after this.
 * Phase 1 blueprints: landing | saas | ecommerce.
 */

export type ProductionAppType = 'landing' | 'saas' | 'ecommerce'

export type ApplicationPlan = {
  appType: ProductionAppType
  backendRequired: boolean
  authRequired: boolean
  databaseRequired: boolean
  commerceRequired: boolean
  source: 'explicit' | 'inferred' | 'default'
}

const EXPLICIT_ALIASES: Record<string, ProductionAppType> = {
  landing: 'landing',
  marketing: 'landing',
  static: 'landing',
  website: 'landing',
  saas: 'saas',
  software: 'saas',
  b2b: 'saas',
  crm: 'saas',
  dashboard: 'saas',
  booking: 'saas',
  appointments: 'saas',
  blog: 'saas',
  ecommerce: 'ecommerce',
  shop: 'ecommerce',
  store: 'ecommerce',
  commerce: 'ecommerce',
}

export function normalizeProductionAppType(raw: string | null | undefined): ProductionAppType | null {
  const t = (raw || '').trim().toLowerCase()
  if (!t) return null
  return EXPLICIT_ALIASES[t] || null
}

export function inferProductionAppType(intent: string): ProductionAppType | null {
  const t = (intent || '').toLowerCase()
  if (!t.trim()) return null
  if (
    /\b(ecommerce|e-commerce|online store|storefront|shop|store|cart|checkout|catalog|inventory|orders?)\b/.test(
      t,
    )
  ) {
    return 'ecommerce'
  }
  if (
    /\b(saas|crm|dashboard|portal|membership|workspace|client app|web app|login|sign[\s-]?up|accounts?|auth|database|backend|booking|appointments?)\b/.test(
      t,
    )
  ) {
    return 'saas'
  }
  if (/\b(landing|marketing site|brochure|portfolio|website for)\b/.test(t)) {
    return 'landing'
  }
  // "website" alone is landing; "website with login/backend/shop" already matched above.
  if (/\bwebsite\b/.test(t) && !/\b(app|platform|system)\b/.test(t)) {
    return 'landing'
  }
  return null
}

export function planProductionApp(input: {
  appType?: string | null
  intent?: string | null
}): ApplicationPlan {
  const explicit = normalizeProductionAppType(input.appType)
  const inferred = inferProductionAppType(input.intent || '')
  const appType = explicit || inferred || 'landing'
  const source: ApplicationPlan['source'] = explicit ? 'explicit' : inferred ? 'inferred' : 'default'
  const backendRequired = appType !== 'landing'
  return {
    appType,
    backendRequired,
    authRequired: appType === 'saas' || appType === 'ecommerce',
    databaseRequired: backendRequired,
    commerceRequired: appType === 'ecommerce',
    source,
  }
}
