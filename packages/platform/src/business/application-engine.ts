/**
 * Functional Application Engine — ecommerce v1 kernel.
 * Website/UI is presentation of BusinessRuntimeState, not the catalog/checkout engine.
 * Payments is an integration slot on commerce — not a separate npm package.
 */

import type { BusinessProduct } from './data'

export const ECOMMERCE_KERNEL_ID = 'ecommerce-v1' as const

export const ECOMMERCE_KERNEL_PAGES = [
  'home',
  'collection',
  'product',
  'cart',
  'checkout',
  'account',
] as const

export const ECOMMERCE_KERNEL_WORKFLOWS = [
  'browse_product_variant_cart_checkout_order',
  'operator_product_variants_inventory',
] as const

/** Gen-1 capability ids the ecommerce kernel requires (Capability Resolver). */
export const ECOMMERCE_REQUIRED_CAPABILITY_IDS = ['catalog', 'commerce', 'auth', 'businessData'] as const

export type ApplicationKernelId = 'ecommerce-v1' | 'saas-v1' | 'landing-v1'

export type ApplicationCapabilityPlan = {
  kernel: ApplicationKernelId
  businessType: 'ecommerce' | 'saas' | 'landing'
  requiredCapabilities: string[]
  /** Payment gateway is a commerce adapter slot — not a sixth public agent tool. */
  optionalCapabilities: string[]
  pages: readonly string[]
  workflows: readonly string[]
}

export function normalizeApplicationBusinessType(
  raw?: string | null,
): ApplicationCapabilityPlan['businessType'] {
  const t = String(raw || '').toLowerCase().trim()
  if (t === 'saas' || t === 'app') return 'saas'
  if (t === 'landing' || t === 'website' || t === 'site') return 'landing'
  return 'ecommerce'
}

export function capabilityPlanFromBusinessType(
  businessType?: string | null,
): ApplicationCapabilityPlan {
  const type = normalizeApplicationBusinessType(businessType)
  if (type === 'landing') {
    return {
      kernel: 'landing-v1',
      businessType: type,
      requiredCapabilities: [],
      optionalCapabilities: [],
      pages: ['home'],
      workflows: [],
    }
  }
  if (type === 'saas') {
    return {
      kernel: 'saas-v1',
      businessType: type,
      requiredCapabilities: ['auth', 'businessData'],
      optionalCapabilities: [],
      pages: ['home', 'account'],
      workflows: [],
    }
  }
  return {
    kernel: ECOMMERCE_KERNEL_ID,
    businessType: 'ecommerce',
    requiredCapabilities: [...ECOMMERCE_REQUIRED_CAPABILITY_IDS],
    optionalCapabilities: [],
    pages: ECOMMERCE_KERNEL_PAGES,
    workflows: ECOMMERCE_KERNEL_WORKFLOWS,
  }
}

export type ApplicationReleaseGate = {
  requiredCapabilitiesSatisfied: boolean
  workflowsPassed: boolean
  runtimeBound: boolean
  securityPassed: boolean
  /** Null until a LIVE publish smoke has a job result. Never a customer percentage. */
  productionSmokePassed: boolean | null
  claimPreviewReady: boolean
  claimLive: boolean
}

export type ApplicationFailureClass = 'RUNTIME_FAILURE' | 'UI_FAILURE' | 'SECURITY_FAILURE'

export function classifyApplicationFailure(input: {
  httpStatus?: number
  checkoutApiOk?: boolean
  uiBound?: boolean
  securityLeak?: boolean
}): { class: ApplicationFailureClass; repair: 'runtime' | 'preview-html' | 'security' } {
  if (input.securityLeak) return { class: 'SECURITY_FAILURE', repair: 'security' }
  if (typeof input.httpStatus === 'number' && input.httpStatus >= 500) {
    return { class: 'RUNTIME_FAILURE', repair: 'runtime' }
  }
  if (input.checkoutApiOk === false) return { class: 'RUNTIME_FAILURE', repair: 'runtime' }
  if (input.checkoutApiOk === true && input.uiBound === false) {
    return { class: 'UI_FAILURE', repair: 'preview-html' }
  }
  return { class: 'RUNTIME_FAILURE', repair: 'runtime' }
}

function htmlLooksRuntimeBound(html?: string | null): boolean {
  if (!html) return false
  return /indobase\.commerce|indobase\.runtime|catalog\.products|variantId/.test(html)
}

function productHasVariant(product: BusinessProduct): boolean {
  return Array.isArray(product.variants) && product.variants.length > 0
}

export function evaluateApplicationReleaseGate(input: {
  businessType?: string | null
  products?: BusinessProduct[]
  catalogReady?: boolean
  previewReady?: boolean
  previewUrl?: string | null
  liveIsLive?: boolean
  liveUrl?: string | null
  jobLive?: boolean
  html?: string | null
  securityPassed?: boolean
}): ApplicationReleaseGate {
  const plan = capabilityPlanFromBusinessType(input.businessType)
  const products = input.products || []
  const store = plan.businessType === 'ecommerce'
  const catalogOk = Boolean(input.catalogReady) || products.length > 0
  const workflowsPassed = store
    ? products.some((p) => productHasVariant(p) || Boolean(p.id || p.name))
    : true
  const runtimeBound = store
    ? htmlLooksRuntimeBound(input.html) || catalogOk
    : true
  const requiredCapabilitiesSatisfied = store ? catalogOk : true
  const securityPassed = input.securityPassed !== false
  const previewReachable = Boolean(input.previewReady && input.previewUrl)
  const claimPreviewReady =
    previewReachable && requiredCapabilitiesSatisfied && workflowsPassed && runtimeBound && securityPassed
  const productionSmokePassed = input.jobLive == null && !input.liveIsLive ? null : Boolean(input.jobLive)
  const liveOk = Boolean(input.liveIsLive && input.liveUrl && input.jobLive)
  const claimLive = liveOk && (store ? claimPreviewReady && productionSmokePassed === true : true)

  return {
    requiredCapabilitiesSatisfied,
    workflowsPassed,
    runtimeBound,
    securityPassed,
    productionSmokePassed,
    claimPreviewReady: store ? claimPreviewReady : previewReachable && securityPassed,
    claimLive,
  }
}
