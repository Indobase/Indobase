/**
 * Immutable-enough BusinessSpec inferred from operator intent.
 * Downstream catalog/generation must receive this — never a generic apparel default.
 */

import {
  ECOMMERCE_VERTICALS,
  findEcommerceVertical,
  resolveEcommerceVerticalId,
  type AppVertical,
} from '../vertical-catalog.js'

export type BusinessSpec = {
  businessName: string
  businessType: 'ecommerce' | 'saas' | 'landing'
  industry: string
  targetCustomer: string
  brand: string
  catalog: { category: string; verticalId: string }
  currency: 'INR' | 'USD'
  visualStyle: string
  sourceIntent: string
}

const NAME_PATTERNS = [
  /\bcalled\s+([A-Z][\w]+(?:\s+[A-Z][\w]+){0,3})/,
  /\bnamed\s+([A-Z][\w]+(?:\s+[A-Z][\w]+){0,3})/,
  /\bbrand(?:ed)?\s+([A-Z][\w]+(?:\s+[A-Z][\w]+){0,2})/,
]

function inferName(intent: string): string {
  for (const pattern of NAME_PATTERNS) {
    const match = pattern.exec(intent)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function inferBusinessType(intent: string): BusinessSpec['businessType'] {
  const q = intent.toLowerCase()
  if (/\b(saas|web app|dashboard|accounts)\b/.test(q) && !/\b(store|shop|sneaker|ecommerce)\b/.test(q)) {
    return 'saas'
  }
  if (/\b(landing|marketing site|website for)\b/.test(q) && !/\b(store|shop|sell)\b/.test(q)) {
    return 'landing'
  }
  return 'ecommerce'
}

function inferStyle(intent: string): string {
  const q = intent.toLowerCase()
  const bits: string[] = []
  if (/\bpremium\b/.test(q)) bits.push('premium')
  if (/\bminimal/.test(q)) bits.push('minimalist')
  if (/\beditorial\b/.test(q)) bits.push('editorial')
  if (/\bluxury\b/.test(q)) bits.push('luxury')
  return bits.join(' ') || 'clean contemporary'
}

function inferCurrency(intent: string): BusinessSpec['currency'] {
  const q = intent.toLowerCase()
  if (/\b(usd|dollar|international)\b/.test(q)) return 'USD'
  return 'INR'
}

function inferVerticalId(intent: string): string {
  return resolveEcommerceVerticalId(intent) || findEcommerceVertical(intent)?.id || 'apparel'
}

export function verticalForSpec(spec: Pick<BusinessSpec, 'catalog'>): AppVertical | null {
  const id = spec.catalog.verticalId
  return ECOMMERCE_VERTICALS.find((v) => v.id === id) || findEcommerceVertical(id)
}

export function inferBusinessSpec(intent: string): BusinessSpec {
  const sourceIntent = (intent || '').trim()
  const businessType = inferBusinessType(sourceIntent)
  const verticalId = businessType === 'ecommerce' ? inferVerticalId(sourceIntent) : businessType
  const vertical = ECOMMERCE_VERTICALS.find((v) => v.id === verticalId)
  const businessName = inferName(sourceIntent) || 'your business'
  return {
    businessName,
    businessType,
    industry: vertical?.label || verticalId,
    targetCustomer: businessType === 'ecommerce' ? 'shoppers' : 'users',
    brand: businessName,
    catalog: {
      category: vertical?.label || verticalId,
      verticalId,
    },
    currency: inferCurrency(sourceIntent),
    visualStyle: inferStyle(sourceIntent),
    sourceIntent,
  }
}

const specs = new Map<string, BusinessSpec>()

export function rememberBusinessSpec(projectRef: string, spec: BusinessSpec): BusinessSpec {
  const key = projectRef.trim()
  if (!key) return spec
  specs.set(key, spec)
  return spec
}

export function getBusinessSpec(projectRef: string | null | undefined): BusinessSpec | null {
  const key = (projectRef || '').trim()
  if (!key) return null
  return specs.get(key) || null
}

export function clearBusinessSpecsForTests(): void {
  specs.clear()
}

export function mergeBusinessSpec(
  existing: BusinessSpec | null,
  next: Partial<BusinessSpec> & { sourceIntent?: string },
): BusinessSpec {
  const base = existing || inferBusinessSpec(next.sourceIntent || '')
  return {
    ...base,
    ...next,
    catalog: { ...base.catalog, ...(next.catalog || {}) },
    sourceIntent: next.sourceIntent || base.sourceIntent,
  }
}
