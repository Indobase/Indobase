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
import { loadGen3Record, persistGen3Record } from './gen3-durable.js'

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
  businessId?: string
  revision?: number
  sealed?: boolean
  createdFromTurnId?: string
}

const PLACEHOLDER_NAMES = new Set([
  'your business',
  'my business',
  'our business',
  'the business',
  'workspace',
  'store',
  'shop',
  'site',
  'untitled',
  'preview',
  'indobase',
])

export function isPlaceholderBusinessName(name: string | null | undefined): boolean {
  const n = (name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!n) return true
  if (PLACEHOLDER_NAMES.has(n)) return true
  if (/^your[\s-]+business$/.test(n)) return true
  return false
}

const NAME_STOP = new Set([
  'a',
  'an',
  'the',
  'store',
  'shop',
  'premium',
  'sneaker',
  'sneakers',
  'launch',
  'website',
  'site',
  'app',
  'saas',
])

function stripNameDecorators(raw: string): string {
  return raw
    .replace(/[*_`~]+/g, '')
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim()
}

function looksLikeName(raw: string): boolean {
  const n = stripNameDecorators(raw)
  if (!n || isPlaceholderBusinessName(n)) return false
  const words = n.split(/\s+/)
  if (words.length === 0 || words.length > 4) return false
  if (words.every((w) => NAME_STOP.has(w.toLowerCase()))) return false
  if (!/^[A-Za-z][A-Za-z0-9&'-]*(?:\s+[A-Za-z][A-Za-z0-9&'-]*){0,3}$/.test(n)) return false
  return true
}

function preserveOrTitleCase(raw: string): string {
  const n = stripNameDecorators(raw)
  if (/[A-Z]/.test(n) && /[a-z]/.test(n)) return n
  if (/^[A-Z0-9&'-]+$/.test(n.replace(/\s+/g, ''))) return n
  return n
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

const NAME_PATTERNS = [
  /\bcall(?:ed)?\s+it\s*[:\-–—]?\s*[`"*'“”‘’]*\s*([A-Za-z][A-Za-z0-9&'-]*(?:[ \t]+[A-Za-z][A-Za-z0-9&'-]*){0,3})/i,
  /\bcalled\s*[:\-–—]?\s*[`"*'“”‘’]*\s*([A-Za-z][A-Za-z0-9&'-]*(?:[ \t]+[A-Za-z][A-Za-z0-9&'-]*){0,3})/i,
  /\bnamed\s*[:\-–—]?\s*[`"*'“”‘’]*\s*([A-Za-z][A-Za-z0-9&'-]*(?:[ \t]+[A-Za-z][A-Za-z0-9&'-]*){0,3})/i,
  /\bbrand(?:ed)?\s*[:\-–—]?\s*[`"*'“”‘’]*\s*([A-Za-z][A-Za-z0-9&'-]*(?:[ \t]+[A-Za-z][A-Za-z0-9&'-]*){0,2})/i,
  /["“]([A-Za-z][A-Za-z0-9&'-]*(?:[ \t]+[A-Za-z][A-Za-z0-9&'-]*){0,3})["”]/,
  /['‘]([A-Za-z][A-Za-z0-9&'-]*(?:[ \t]+[A-Za-z][A-Za-z0-9&'-]*){0,3})['’]/,
  /\bfor\s+(?:a|an|my|our)\s+([A-Za-z][A-Za-z0-9&'-]*(?:[ \t]+(?:store|shop|brand|studio|company|co))?)/i,
]

function takeBrandTokens(raw: string): string {
  const words = stripNameDecorators(raw).split(/\s+/).filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  for (const word of words) {
    const clean = stripNameDecorators(word)
    const key = clean.toLowerCase()
    if (!looksLikeName(clean) || NAME_STOP.has(key) || seen.has(key)) break
    seen.add(key)
    out.push(clean)
  }
  return out.length ? preserveOrTitleCase(out.join(' ')) : ''
}

function descriptivePhraseName(raw: string): string {
  const n = stripNameDecorators(raw)
  const words = n.split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const phrase = words.join(' ')
  if (isPlaceholderBusinessName(phrase)) return ''
  return preserveOrTitleCase(phrase)
}

export function inferName(intent: string): string {
  const source = intent || ''
  for (const pattern of NAME_PATTERNS) {
    const match = pattern.exec(source)
    const captured = match?.[1] || ''
    const name = captured ? takeBrandTokens(captured) || descriptivePhraseName(captured) : ''
    if (name && !isPlaceholderBusinessName(name)) return name
  }
  return ''
}

export function specIdentityFingerprint(
  spec: Pick<BusinessSpec, 'businessType' | 'businessName' | 'catalog'>,
): string {
  return [spec.businessType, spec.catalog.verticalId, spec.businessName.trim().toLowerCase()].join('|')
}

export function isAuthoritativeCreateIntent(intent: string): boolean {
  const q = (intent || '').toLowerCase()
  if (!q) return false
  if (/\bgo live\b/.test(q) && !/\b(create|build|make)\b/.test(q)) return false
  return /\b(create|build|make)\b/.test(q) || /\blaunch a\b/.test(q)
}

export function pickBusinessName(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const n = (candidate || '').trim()
    if (n && !isPlaceholderBusinessName(n) && looksLikeName(n)) return n
  }
  const joined = candidates.filter((c): c is string => Boolean(c && String(c).trim())).join(' ')
  return inferName(joined)
}

function inferBusinessType(intent: string): BusinessSpec['businessType'] {
  const q = intent.toLowerCase()
  if (
    /\b(store|shop|sneaker|sneakers|ecommerce|boutique|order(?:ing)?|food|grocery|restaurant|cafe|bakery|menu|cart|checkout)\b/.test(
      q,
    )
  ) {
    return 'ecommerce'
  }
  if (
    /\b(saas|software as a service|web app|webapp|dashboard|client portal|customer portal|b2b|crm)\b/.test(q)
  ) {
    return 'saas'
  }
  if (/\b(build|launch|create|make)\b.{0,48}\b(?:an?\s+)?(?:app|application|platform|software)\b/.test(q)) {
    return 'saas'
  }
  if (
    /\b(landing(?:\s+page)?|marketing site|brochure|portfolio|\bwebsite\b)\b/.test(q) &&
    !/\b(sell|shop|store|checkout|cart)\b/.test(q)
  ) {
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
  const resolved = resolveEcommerceVerticalId(intent) || findEcommerceVertical(intent)?.id
  if (resolved) return resolved
  return 'unspecified'
}

/** True when the operator named a brand/vertical/app type — BUILD may run. Vague “ordering site / infer the rest” stays clarify. */
export function intentReadyToBuild(intent: string): boolean {
  const q = (intent || '').trim()
  if (!q) return false
  if (/infer the rest/i.test(q) && !/vertical\s*=/.test(q)) return false
  if (/i['’]ll type my specific niche/i.test(q) && !/vertical\s*=/.test(q)) return false
  if (/vertical\s*=\s*[a-z0-9-]+/i.test(q)) return true
  if (/this is a landing website/i.test(q) || /this is a saas app/i.test(q)) return true
  if (/this is an online store/i.test(q) && !/vertical\s*=/.test(q) && !findEcommerceVertical(q)) return false
  const spec = inferBusinessSpec(q)
  if (spec.catalog.verticalId && spec.catalog.verticalId !== 'unspecified') return true
  if (spec.businessType === 'landing' && /\b(landing|marketing site|brochure|website)\b/i.test(q)) return true
  if (spec.businessType === 'saas' && /\b(saas|crm|tutoring)\b/i.test(q) && inferName(q)) return true
  return false
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
  const providedName = inferName(sourceIntent)
  const businessName = providedName || 'your business'
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
    revision: 0,
    sealed: false,
  }
}

const specs = new Map<string, BusinessSpec>()

export function rememberBusinessSpec(projectRef: string, spec: BusinessSpec): BusinessSpec {
  const key = projectRef.trim()
  if (!key) return spec
  const existing = specs.get(key) || loadGen3Record<BusinessSpec>('business-specs', key)
  const next = mergeBusinessSpec(existing || null, spec)
  const provided = inferName(next.sourceIntent || spec.sourceIntent || '')
  if (provided && isPlaceholderBusinessName(next.businessName)) {
    throw new Error('business_spec_name_unresolved')
  }
  specs.set(key, next)
  persistGen3Record('business-specs', key, next)
  return next
}

export function getBusinessSpec(projectRef: string | null | undefined): BusinessSpec | null {
  const key = (projectRef || '').trim()
  if (!key) return null
  const cached = specs.get(key)
  if (cached) return cached
  const disk = loadGen3Record<BusinessSpec>('business-specs', key)
  if (disk) specs.set(key, disk)
  return disk || null
}

export function sealBusinessSpec(projectRef: string, turnId?: string): BusinessSpec | null {
  const existing = getBusinessSpec(projectRef)
  if (!existing) return null
  const sealed: BusinessSpec = {
    ...existing,
    sealed: true,
    revision: (existing.revision || 0) + 1,
    businessId: existing.businessId || `biz_${projectRef}`,
    createdFromTurnId: existing.createdFromTurnId || turnId,
  }
  specs.set(projectRef, sealed)
  persistGen3Record('business-specs', projectRef, sealed)
  return sealed
}

export function clearBusinessSpecsForTests(): void {
  specs.clear()
}

export function mergeBusinessSpec(
  existing: BusinessSpec | null,
  next: Partial<BusinessSpec> & { sourceIntent?: string },
): BusinessSpec {
  const inferredFromNext = inferBusinessSpec(next.sourceIntent || existing?.sourceIntent || '')
  const replacing =
    Boolean(existing) &&
    isAuthoritativeCreateIntent(next.sourceIntent || '') &&
    specIdentityFingerprint(inferredFromNext) !== specIdentityFingerprint(existing!)
  if (existing?.sealed && !replacing) {
    return {
      ...existing,
      sourceIntent: existing.sourceIntent || next.sourceIntent || inferredFromNext.sourceIntent,
    }
  }
  const base = replacing ? inferredFromNext : existing || inferredFromNext
  const nextNameHint = pickBusinessName(next.businessName, next.brand, inferName(next.sourceIntent || ''))
  const nextIsWeak = !nextNameHint && !replacing
  if (existing && nextIsWeak && !replacing) {
    return {
      ...existing,
      sourceIntent: existing.sourceIntent || next.sourceIntent || inferredFromNext.sourceIntent,
    }
  }
  const name = pickBusinessName(
    next.businessName,
    next.brand,
    replacing ? inferredFromNext.businessName : existing?.businessName,
    inferredFromNext.businessName,
    inferName(next.sourceIntent || ''),
    inferName(existing?.sourceIntent || ''),
  )
  const businessName =
    name || (isPlaceholderBusinessName(base.businessName) ? inferredFromNext.businessName : base.businessName)
  const nextVertical = next.catalog?.verticalId || inferredFromNext.catalog.verticalId
  const catalog =
    replacing || (nextVertical && nextVertical !== 'apparel' && nextVertical !== 'electronics')
      ? { ...base.catalog, ...(next.catalog || inferredFromNext.catalog) }
      : { ...base.catalog, ...(existing ? {} : next.catalog || {}) }
  return {
    ...base,
    ...next,
    businessType: replacing ? inferredFromNext.businessType : next.businessType || base.businessType,
    businessName: businessName || base.businessName || 'your business',
    brand: pickBusinessName(next.brand, businessName, base.brand) || businessName || base.brand,
    catalog,
    visualStyle:
      next.visualStyle && next.visualStyle !== 'clean contemporary' ? next.visualStyle : base.visualStyle,
    sourceIntent: replacing
      ? next.sourceIntent || inferredFromNext.sourceIntent
      : existing?.sourceIntent || next.sourceIntent || base.sourceIntent,
    sealed: replacing ? false : Boolean(existing?.sealed),
    revision: replacing ? 0 : existing?.revision || base.revision || 0,
    businessId: replacing ? undefined : existing?.businessId || base.businessId,
  }
}
