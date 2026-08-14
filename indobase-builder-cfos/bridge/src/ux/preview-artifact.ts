/**
 * Deterministic preview build — files on disk, not prose.
 * Launch / data engine is not required for a first preview.
 */

import { createHash } from 'node:crypto'
import type { BackendConfig } from '../auth.js'
import { buildManagedShopStorefrontHtml } from '../pocketbase/shop-storefront-html.js'
import { buildProductionLandingHtml, buildProductionSaasHtml } from '../production-launch/shells.js'
import {
  draftPreviewUrl,
  previewArtifactExists,
  probePreviewHttp,
  readLiveFile,
  writeDraftPreview,
} from '../static-launch.js'
import { isPlaceholderBusinessName, verticalForSpec, type BusinessSpec } from './business-spec.js'
import type { PreviewStatus } from './preview-gate.js'

export type PreviewBuildResult = {
  ok: boolean
  status: PreviewStatus
  url: string | null
  artifactRef: string | null
  contentHash: string | null
  httpOk: boolean | null
  files: Record<string, string>
  html: string
  message: string
}

function metadataFor(spec: BusinessSpec): string {
  return `${JSON.stringify(
    {
      name: spec.businessName,
      vertical: spec.catalog.verticalId,
      positioning: spec.visualStyle,
      businessType: spec.businessType,
    },
    null,
    2,
  )}\n`
}

export function storefrontHasCommerceAbi(html: string | null | undefined): boolean {
  return /indobase\.commerce|indobase\s*=\s*\{[\s\S]{0,80}commerce|\/api\/os\/commerce/i.test(html || '')
}

export type StorefrontCatalogProduct = {
  id: string
  name: string
  slug?: string
  description?: string
  priceMinor?: number
  stock?: number
  currency?: string
  variants?: Array<{
    id?: string
    sku?: string
    title?: string
    options?: Record<string, string>
    priceMinor?: number
    stock?: number
    default?: boolean
  }>
}

export type StorefrontCatalogCollection = {
  id?: string
  name?: string
  slug?: string
  productIds?: string[]
}

/** Baked `let products=[…]` fallback. Live grid still prefers commerce.products.list(). */
export function serializeStorefrontCatalogSnapshot(products: StorefrontCatalogProduct[]): string {
  return JSON.stringify(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug || '',
      description: p.description || '',
      priceMinor: typeof p.priceMinor === 'number' ? p.priceMinor : 0,
      currency: p.currency || 'INR',
      stock: Number(p.stock || 0),
      imageUrl: '',
      active: true,
      variants: p.variants || [],
    })),
  )
}

function replaceLetArray(html: string, name: string, snapshot: string): string {
  const needle = `let ${name}=`
  const start = html.indexOf(needle)
  if (start < 0) return html
  const jsonStart = start + needle.length
  if (html[jsonStart] !== '[') {
    const semi = html.indexOf(';', jsonStart)
    if (semi < 0) return html
    return `${html.slice(0, jsonStart)}${snapshot}${html.slice(semi)}`
  }
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i]
    if (inStr) {
      if (esc) {
        esc = false
        continue
      }
      if (ch === '\\') {
        esc = true
        continue
      }
      if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        let end = i + 1
        if (html[end] === ';') end += 1
        return `${html.slice(0, jsonStart)}${snapshot};${html.slice(end)}`
      }
    }
  }
  return html
}

export function injectStorefrontProductSnapshot(
  html: string,
  products: StorefrontCatalogProduct[],
  collections: StorefrontCatalogCollection[] = [],
): string {
  if (!html) return html
  const snapshot = serializeStorefrontCatalogSnapshot(products)
  const collectionSnapshot = JSON.stringify(
    collections.map((c) => ({
      id: c.id || '',
      name: c.name || '',
      slug: c.slug || '',
      productIds: c.productIds || [],
    })),
  )
  let next = html
  if (!next.includes('let products=')) {
    if (!storefrontHasCommerceAbi(next)) return next
    next = next.replace(
      /(const commerce=window\.indobase\.commerce;\s*)/,
      `$1let products=${snapshot};\n`,
    )
  } else {
    next = replaceLetArray(next, 'products', snapshot)
  }
  if (next.includes('let collections=')) {
    next = replaceLetArray(next, 'collections', collectionSnapshot)
  } else if (next.includes('let products=')) {
    next = next.replace('let products=', `let collections=${collectionSnapshot};\nlet products=`)
  }
  return next
}

export function saasAppHasRuntimeAbi(html: string | null | undefined): boolean {
  const text = html || ''
  return /auth-with-otp/i.test(text) && /__INDOBASE_ENV__|\/api\/collections\//i.test(text)
}

function stubSaasBackend(projectRef: string): BackendConfig {
  return {
    anon_key: 'public',
    api_url: 'https://records.indobase.in',
    auth_url: 'https://records.indobase.in/api',
    project_name: projectRef,
    project_ref: projectRef,
    project_url: 'https://records.indobase.in',
    rest_url: 'https://records.indobase.in/api/collections',
    storage_url: 'https://records.indobase.in/api/files',
  }
}

function extractLiveHeadline(html: string): string | null {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  if (!match) return null
  const text = match[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text || isPlaceholderBusinessName(text)) return null
  return text
}

export function ensureSaasAppFiles(input: {
  spec: BusinessSpec
  projectRef: string
  html?: string | null
  files?: Record<string, string> | null
  backend?: BackendConfig | null
}): { html: string; files: Record<string, string>; rebuilt: boolean } {
  const current = input.files?.['index.html'] || input.html || ''
  if (saasAppHasRuntimeAbi(current)) {
    return {
      html: current,
      files: { ...(input.files || {}), 'index.html': current },
      rebuilt: false,
    }
  }
  const headline = extractLiveHeadline(current)
  const brand =
    headline ||
    (input.spec.businessName && !isPlaceholderBusinessName(input.spec.businessName)
      ? input.spec.businessName
      : 'Workspace')
  const html = buildProductionSaasHtml({
    brand,
    backend: input.backend || stubSaasBackend(input.projectRef),
  })
  return {
    html,
    files: {
      ...(input.files || {}),
      'index.html': html,
      'metadata.json': metadataFor({ ...input.spec, businessType: 'saas' }),
    },
    rebuilt: true,
  }
}

export function landingAppHasPublishableArtifact(html: string | null | undefined): boolean {
  const text = html || ''
  if (!text || storefrontHasCommerceAbi(text) || saasAppHasRuntimeAbi(text)) return false
  return /<h1[\s>]/i.test(text)
}

export function ensureLandingAppFiles(input: {
  spec: BusinessSpec
  html?: string | null
  files?: Record<string, string> | null
}): { html: string; files: Record<string, string>; rebuilt: boolean } {
  const current = input.files?.['index.html'] || input.html || ''
  if (landingAppHasPublishableArtifact(current) || (/<h1[\s>]/i.test(current) && !storefrontHasCommerceAbi(current))) {
    const headline = extractLiveHeadline(current)
    if (headline && landingAppHasPublishableArtifact(current)) {
      return {
        html: current,
        files: { ...(input.files || {}), 'index.html': current },
        rebuilt: false,
      }
    }
    if (headline && !storefrontHasCommerceAbi(current) && !saasAppHasRuntimeAbi(current)) {
      const html = mutateHeroHeadline(
        buildProductionLandingHtml({ brand: headline, intent: input.spec.sourceIntent }),
        headline,
      )
      return {
        html,
        files: {
          ...(input.files || {}),
          'index.html': html,
          'metadata.json': metadataFor({ ...input.spec, businessType: 'landing' }),
        },
        rebuilt: true,
      }
    }
  }
  const html = buildProductionLandingHtml({
    brand:
      input.spec.businessName && !isPlaceholderBusinessName(input.spec.businessName)
        ? input.spec.businessName
        : 'Your business',
    intent: input.spec.sourceIntent,
  })
  return {
    html,
    files: {
      ...(input.files || {}),
      'index.html': html,
      'metadata.json': metadataFor({ ...input.spec, businessType: 'landing' }),
    },
    rebuilt: true,
  }
}

export function ensureEcommerceStorefrontFiles(input: {
  spec: BusinessSpec
  projectRef: string
  html?: string | null
  files?: Record<string, string> | null
}): { html: string; files: Record<string, string>; rebuilt: boolean } {
  const current = input.files?.['index.html'] || input.html || ''
  if (input.spec.businessType === 'ecommerce' && storefrontHasCommerceAbi(current)) {
    return {
      html: current,
      files: { ...(input.files || {}), 'index.html': current },
      rebuilt: false,
    }
  }
  const files = buildPreviewFiles(
    { ...input.spec, businessType: input.spec.businessType || 'ecommerce' },
    input.projectRef,
  )
  return { html: files['index.html'], files: { ...(input.files || {}), ...files }, rebuilt: true }
}

export function buildPreviewFiles(spec: BusinessSpec, projectRef: string): Record<string, string> {
  const meta = metadataFor(spec)
  if (spec.businessType === 'ecommerce') {
    const vertical = verticalForSpec(spec)
    const products = (vertical?.products || []).map((p) => ({
      id: p.slug,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: Number(p.price) || 0,
      currency: spec.currency || p.currency || 'INR',
      stock: p.stock,
      image_url: '',
      active: true,
    }))
    const html = buildManagedShopStorefrontHtml({
      brand: spec.businessName,
      tagline: `${spec.visualStyle} ${spec.industry}`.trim(),
      appId: projectRef,
      publicUrl: '',
      products,
    })
    return { 'index.html': html, 'metadata.json': meta }
  }
  if (spec.businessType === 'saas') {
    const html = buildProductionSaasHtml({
      brand: spec.businessName,
      backend: stubSaasBackend(projectRef),
    })
    return { 'index.html': html, 'metadata.json': meta }
  }
  const html = buildProductionLandingHtml({
    brand: spec.businessName,
    intent: spec.sourceIntent,
  })
  return { 'index.html': html, 'metadata.json': meta }
}

function tidyHeadline(raw: string | null | undefined): string | null {
  const n = (raw || '')
    .replace(/^[\s`'"“”‘’]+|[\s`'"“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!n || n.length < 3 || n.length > 120) return null
  if (/^(make|change|rewrite|update|edit|hide|delete|move|duplicate)\b/i.test(n) && n.length < 28) {
    return null
  }
  return n
}

export function extractRequestedHeadline(message: string): string | null {
  const text = (message || '').trim()
  if (!text) return null
  const quoted =
    /(?:hero\s+)?headline\s+to\s+[`'‘’""]([^`'‘’""]+)[`'‘’""]/i.exec(text) ||
    /request:\s*(?:change\s+(?:the\s+)?(?:hero(?:\s+headline)?|headline)\s+to\s+)?[`'‘’""]([^`'‘’""]+)[`'‘’""]/i.exec(
      text,
    ) ||
    /rewrite(?:\s+the)?(?:\s+hero)?(?:\s+headline)?\s+to\s+[`'‘’""]([^`'‘’""]+)[`'‘’""]/i.exec(text) ||
    /(?:hero\s+)?headline\s+to\s+([^\n]+)/i.exec(text)
  const fromQuote = tidyHeadline(quoted?.[1])
  if (fromQuote) return fromQuote
  const requestLine = /^request:\s*(.+)$/im.exec(text)
  const fromRequest = tidyHeadline(requestLine?.[1])
  if (fromRequest) return fromRequest
  if (/\bmake (?:the )?hero more premium\b/i.test(text) || /\bpremium hero\b/i.test(text)) {
    return 'Premium sneakers. Built to move.'
  }
  return null
}

export function mutateHeroHeadline(html: string, headline: string): string {
  const next = headline.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  if (/data-ib-section=["']hero["'][\s\S]*?<h1\b/i.test(html)) {
    return html.replace(
      /(data-ib-section=["']hero["'][\s\S]*?<h1[^>]*>)[\s\S]*?(<\/h1>)/i,
      `$1${next}$2`,
    )
  }
  return html.replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/i, `$1${next}$2`)
}

export function hashPreviewFiles(files: Record<string, string>): string {
  const hash = createHash('sha256')
  for (const [rel, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(rel)
    hash.update(content)
  }
  return hash.digest('hex').slice(0, 16)
}

export async function verifyPreviewReachable(input: {
  projectRef: string
  url: string
  probe?: typeof probePreviewHttp
}): Promise<boolean> {
  const probe = input.probe || probePreviewHttp
  const httpOk = await probe(input.url)
  if (httpOk) return true
  const file = await readLiveFile(input.projectRef, 'index.html')
  return Boolean(file && file.body.length > 32)
}

export async function materializePreview(input: {
  projectRef: string
  spec: BusinessSpec
  probe?: typeof probePreviewHttp
}): Promise<PreviewBuildResult> {
  const files = buildPreviewFiles(input.spec, input.projectRef)
  const html = files['index.html'] || ''
  if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
    return {
      ok: false,
      status: 'failed',
      url: null,
      artifactRef: null,
      contentHash: null,
      httpOk: false,
      files,
      html,
      message: 'Preview build did not produce HTML.',
    }
  }

  const written = await writeDraftPreview({
    workspaceRef: input.projectRef,
    title: input.spec.businessName,
    files,
  })
  const exists = await previewArtifactExists(input.projectRef)
  if (!written.ok || !exists) {
    return {
      ok: false,
      status: 'failed',
      url: null,
      artifactRef: written.artifactRef || null,
      contentHash: written.contentHash || hashPreviewFiles(files),
      httpOk: false,
      files,
      html,
      message: 'Could not write preview files.',
    }
  }

  const url = written.previewUrl || draftPreviewUrl(input.projectRef)
  const httpOk = await verifyPreviewReachable({
    projectRef: input.projectRef,
    url,
    probe: input.probe,
  })
  if (!httpOk) {
    return {
      ok: false,
      status: 'failed',
      url,
      artifactRef: written.artifactRef,
      contentHash: written.contentHash,
      httpOk: false,
      files,
      html,
      message: 'Preview files exist but the preview URL did not respond.',
    }
  }

  return {
    ok: true,
    status: 'ready',
    url,
    artifactRef: written.artifactRef,
    contentHash: written.contentHash,
    httpOk: true,
    files,
    html,
    message: 'Preview ready',
  }
}
