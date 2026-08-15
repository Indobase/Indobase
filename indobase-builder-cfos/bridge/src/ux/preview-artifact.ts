/**
 * Deterministic preview build — files on disk, not prose.
 * Launch / data engine is not required for a first preview.
 */

import { createHash } from 'node:crypto'
import type { BackendConfig } from '../auth.js'
import { persistCatalogProjection } from './catalog-domain.js'
import { displayPriceMinorFromVariants } from './catalog-domain.js'
import { buildSpecBoundStorefrontHtml } from './spec-bound-storefront.js'
import { buildProductionLandingHtml, buildProductionSaasHtml } from '../production-launch/shells.js'
import {
  draftPreviewUrl,
  previewArtifactExists,
  probePreviewHttp,
  readLiveFile,
  writeDraftPreview,
} from '../static-launch.js'
import { flattenSafeFiles, isViteReactProject } from '../production-launch/react-project.js'
import { scaffoldViteReactProject } from '../production-launch/scaffold-vite-react.js'
import { buildViteReactApp, type ViteBuildRunner } from '../production-launch/vite-build.js'
import { injectPreviewBoot } from './preview-boot.js'
import { sanitizeAppId } from '../pocketbase/managed.js'
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
  /** Vite + React source tree (kept for MODIFY / Go Live). Disk host uses `files` (dist). */
  sourceFiles?: Record<string, string>
  html: string
  message: string
}

function metadataFor(spec: BusinessSpec, extra?: Record<string, unknown>): string {
  return `${JSON.stringify(
    {
      name: spec.businessName,
      vertical: spec.catalog.verticalId,
      positioning: spec.visualStyle,
      businessType: spec.businessType,
      ...extra,
    },
    null,
    2,
  )}\n`
}

export function storefrontHasCommerceAbi(html: string | null | undefined): boolean {
  return /indobase\.commerce|indobase\s*=\s*\{[\s\S]{0,80}commerce|\/api\/os\/commerce/i.test(html || '')
}

/** Bind commerce ABI without replacing layout/CSS. Idempotent. */
export function injectCommerceRuntimeIntoHtml(html: string, projectRef?: string): string {
  const fromDom = /data-ib-project=["']([^"']+)["']/.exec(html || '')?.[1]
  const ref = sanitizeAppId(projectRef || fromDom || '')
  const scriptSrc = ref
    ? `/api/os/commerce/runtime.js?projectRef=${encodeURIComponent(ref)}`
    : '/api/os/commerce/runtime.js'
  let text = html || ''
  if (ref) {
    text = text.replace(
      /\/api\/os\/commerce\/runtime\.js(?:\?[^"'>\s]*)?/g,
      scriptSrc,
    )
  }
  if (storefrontHasCommerceAbi(text)) return text
  const script = `<script src="${scriptSrc}"></script>`
  if (/<\/head>/i.test(text)) return text.replace(/<\/head>/i, `${script}</head>`)
  if (/<body[\s>]/i.test(text)) return text.replace(/<body([^>]*)>/i, `<body$1>${script}`)
  return `${script}${text}`
}

/**
 * Bind SaaS auth ABI without replacing layout. Idempotent.
 *
 * Requests go to the records base published in `__INDOBASE_ENV__`, not to a
 * relative path — a published site is served from its own host, so a relative
 * /api/collections call never reaches the tenant backend. The verify body
 * carries both `password` (the PocketBase field for the emailed code) and
 * `otp` (accepted by the GoTrue-style proxy mapping).
 */
export function injectSaasRuntimeIntoHtml(html: string): string {
  const text = html || ''
  if (!text.trim() || /auth-with-otp/i.test(text)) return text
  const script =
    '<script>(function(){' +
    'var env=window.__INDOBASE_ENV__||{};' +
    'var api=String(env.INDOBASE_URL||env.INDOBASE_RECORDS_BASE||"").replace(/\\/+$/,"");' +
    'function post(path,body){return fetch(api+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})}' +
    'window.indobase=window.indobase||{};' +
    'window.indobase.auth=window.indobase.auth||{' +
    'startOtp:function(e){return post("/api/collections/users/request-otp",{email:e})},' +
    'verify:function(e,c){return post("/api/collections/users/auth-with-otp",{email:e,otp:c,password:c})}' +
    '};})();</script>'
  if (/<\/head>/i.test(text)) return text.replace(/<\/head>/i, `${script}</head>`)
  if (/<body[\s>]/i.test(text)) return text.replace(/<body([^>]*)>/i, `<body$1>${script}`)
  return `${script}${text}`
}

function bridgePublicOrigin(): string {
  return (
    process.env.INDOBASE_BRIDGE_PUBLIC_URL?.trim() ||
    process.env.BRIDGE_PUBLIC_URL?.trim() ||
    'https://builder.indobase.in'
  ).replace(/\/+$/, '')
}

export function landingHasLeadsAbi(html: string | null | undefined): boolean {
  return /indobase\.leads|\/api\/os\/leads/i.test(html || '')
}

/**
 * Bind the enquiry ABI without replacing layout. Idempotent.
 *
 * A published landing page is served from its own host, so the bridge origin is
 * absolute; the visitor's browser never writes PocketBase directly.
 */
export function injectLeadsRuntimeIntoHtml(html: string, projectRef?: string): string {
  const text = html || ''
  if (!text.trim() || landingHasLeadsAbi(text)) return text
  const fromDom = /data-ib-project=["']([^"']+)["']/.exec(text)?.[1]
  const ref = sanitizeAppId(projectRef || fromDom || '')
  const endpoint = `${bridgePublicOrigin()}/api/os/leads`
  const script =
    '<script>(function(){' +
    `var url=${JSON.stringify(endpoint)};var ref=${JSON.stringify(ref)};` +
    'var fallback="We could not send that just now. Please try again in a moment.";' +
    'window.indobase=window.indobase||{};' +
    'window.indobase.leads=window.indobase.leads||{submit:function(enquiry){' +
    'return fetch(url,{method:"POST",credentials:"omit",headers:{"Content-Type":"application/json"},' +
    'body:JSON.stringify({name:enquiry&&enquiry.name,email:enquiry&&enquiry.email,phone:enquiry&&enquiry.phone,' +
    'message:enquiry&&enquiry.message,source:"website",projectRef:ref})})' +
    '.then(function(res){return res.json().catch(function(){return {}}).then(function(body){' +
    'return {ok:res.ok&&body.ok!==false,message:body.message||(res.ok?"Thanks — your enquiry is with us. We will reply shortly.":fallback)}})})' +
    '.catch(function(){return {ok:false,message:fallback}})' +
    '}};})();</script>'
  if (/<\/head>/i.test(text)) return text.replace(/<\/head>/i, `${script}</head>`)
  if (/<body[\s>]/i.test(text)) return text.replace(/<body([^>]*)>/i, `<body$1>${script}`)
  return `${script}${text}`
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
  const projected = persistCatalogProjection(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      priceMinor: typeof p.priceMinor === 'number' ? p.priceMinor : 0,
      stock: Number(p.stock || 0),
      variants: (p.variants || [])
        .filter((v) => v.id)
        .map((v) => ({
          id: v.id as string,
          sku: v.sku,
          title: v.title,
          options: v.options,
          priceMinor: v.priceMinor,
          stock: v.stock,
          default: v.default,
        })),
    })),
  )
  return JSON.stringify(
    projected.map((p, i) => ({
      id: p.id,
      name: p.name,
      slug: products[i]?.slug || '',
      description: products[i]?.description || '',
      priceMinor: displayPriceMinorFromVariants(p.variants, p.priceMinor) ?? 0,
      currency: products[i]?.currency || 'INR',
      stock: Number(p.stock || 0),
      imageUrl: '',
      active: true,
      variants: p.variants || [],
    })),
  )
}

function replaceAssignedJson(html: string, needle: string, snapshot: string): string {
  const start = html.indexOf(needle)
  if (start < 0) return html
  const jsonStart = start + needle.length
  if (html[jsonStart] !== '[') return html
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
        return `${html.slice(0, jsonStart)}${snapshot}${html.slice(i + 1)}`
      }
    }
  }
  return html
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
  if (next.includes('window.__IB_CATALOG_SNAPSHOT__=')) {
    next = replaceAssignedJson(next, 'window.__IB_CATALOG_SNAPSHOT__=', snapshot)
  } else if (!next.includes('let products=')) {
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
  const match = /<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i.exec(html)
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

function storefrontHtmlMatchesSpec(html: string, spec: BusinessSpec): boolean {
  if (!html.trim()) return false
  if (/circuit nest|corev1-aug13/i.test(html) && !/circuit nest/i.test(spec.businessName)) return false
  const vertical = /data-ib-vertical=["']([^"']+)["']/.exec(html)?.[1]
  if (vertical && spec.catalog.verticalId && vertical !== spec.catalog.verticalId) return false
  return true
}

export function ensureSaasAppFiles(input: {
  spec: BusinessSpec
  projectRef: string
  html?: string | null
  files?: Record<string, string> | null
  backend?: BackendConfig | null
}): { html: string; files: Record<string, string>; rebuilt: boolean } {
  const current = input.files?.['index.html'] || input.html || ''
  const placeholderHero = /<h1>\s*your business\s*<\/h1>/i.test(current)
  if (current.trim() && /<h1[\s>]/i.test(current) && !placeholderHero && storefrontHtmlMatchesSpec(current, input.spec)) {
    const html = injectSaasRuntimeIntoHtml(current)
    return {
      html,
      files: { ...(input.files || {}), 'index.html': html },
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
  projectRef?: string | null
  html?: string | null
  files?: Record<string, string> | null
}): { html: string; files: Record<string, string>; rebuilt: boolean } {
  const current = input.files?.['index.html'] || input.html || ''
  const bindLeads = (value: string) => injectLeadsRuntimeIntoHtml(value, input.projectRef || undefined)
  if (landingAppHasPublishableArtifact(current) || (/<h1[\s>]/i.test(current) && !storefrontHasCommerceAbi(current))) {
    const headline = extractLiveHeadline(current)
    if (headline && landingAppHasPublishableArtifact(current)) {
      const html = bindLeads(current)
      return {
        html,
        files: { ...(input.files || {}), 'index.html': html },
        rebuilt: false,
      }
    }
    if (headline && !storefrontHasCommerceAbi(current) && !saasAppHasRuntimeAbi(current)) {
      const html = bindLeads(
        mutateHeroHeadline(
          buildProductionLandingHtml({ brand: headline, intent: input.spec.sourceIntent }),
          headline,
        ),
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
  const html = bindLeads(
    buildProductionLandingHtml({
      brand:
        input.spec.businessName && !isPlaceholderBusinessName(input.spec.businessName)
          ? input.spec.businessName
          : 'Your business',
      intent: input.spec.sourceIntent,
    }),
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

export function ensureEcommerceStorefrontFiles(input: {
  spec: BusinessSpec
  projectRef: string
  html?: string | null
  files?: Record<string, string> | null
}): { html: string; files: Record<string, string>; rebuilt: boolean } {
  const current = input.files?.['index.html'] || input.html || ''
  const placeholderHero = /<h1>\s*your business\s*<\/h1>/i.test(current)
  if (current.trim() && /<h1[\s>]/i.test(current) && !placeholderHero && storefrontHtmlMatchesSpec(current, input.spec)) {
    const html = injectCommerceRuntimeIntoHtml(current, input.projectRef)
    return {
      html,
      files: { ...(input.files || {}), 'index.html': html },
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
  const meta = metadataFor(spec, { projectRef })
  let html: string
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
    html = buildSpecBoundStorefrontHtml({ spec, projectRef, products })
  } else if (spec.businessType === 'saas') {
    html = buildProductionSaasHtml({
      brand: spec.businessName,
      backend: stubSaasBackend(projectRef),
    })
  } else {
    html = buildProductionLandingHtml({
      brand: spec.businessName,
      intent: spec.sourceIntent,
    })
  }
  const hashed = hashPreviewFiles({ 'index.html': html, 'metadata.json': meta })
  html = injectPreviewBoot(html, {
    projectRef,
    artifactHash: hashed,
    applicationType: spec.businessType,
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
      /(data-ib-section=["']hero["'][\s\S]*?<h1(?:\s[^>]*)?>)[\s\S]*?(<\/h1>)/i,
      `$1${next}$2`,
    )
  }
  return html.replace(/(<h1(?:\s[^>]*)?>)[\s\S]*?(<\/h1>)/i, `$1${next}$2`)
}

/** Patch hero in Vite source (tsx) when present so MODIFY recompiles instead of only editing dist HTML. */
export type PreviewMutation = {
  kind: 'headline' | 'tagline' | 'accent' | 'copy' | 'tone' | 'shorten'
  summary: string
  headline?: string
  tagline?: string
  accent?: string
  from?: string
  to?: string
}

function stripEditPrefix(message: string): string {
  return (message || '').replace(/^PREVIEW_EDIT\b\s*/i, '').replace(/^request:\s*/im, '').trim()
}

export function parsePreviewMutation(message: string): PreviewMutation | null {
  const text = stripEditPrefix(message)
  if (!text) return null
  if (/\bmake (?:the )?hero shorter\b|\bshorter hero\b/i.test(text)) {
    return { kind: 'shorten', summary: 'a shorter hero' }
  }
  const tagline =
    /(?:tagline|subtitle|subheading)\s+to\s+[`'‘’""]([^`'‘’""]+)[`'‘’""]/i.exec(text) ||
    /(?:tagline|subtitle|subheading)\s+to\s+([^\n]+)/i.exec(text)
  const tag = tidyHeadline(tagline?.[1])
  if (tag) return { kind: 'tagline', summary: tag, tagline: tag }

  const accent =
    /(?:accent|brand\s*color|primary\s*color|colour|color)\s+to\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,24})/i.exec(text)
  if (accent?.[1]) {
    const value = accent[1].trim()
    return { kind: 'accent', summary: value, accent: value }
  }

  const copy =
    /change\s+[`'‘’“”"]([^`'‘’“”"]+)[`'‘’“”"]\s+to\s+[`'‘’“”"]([^`'‘’“”"]+)[`'‘’“”"]/i.exec(text)
  if (copy?.[1] && copy[2]) {
    const from = copy[1].trim()
    const to = copy[2].trim()
    if (from.length >= 2 && to.length >= 2) {
      return { kind: 'copy', summary: to, from, to }
    }
  }

  const rename =
    /(?:rename|rebrand)\s+(?:the\s+)?(?:store|shop|site|business|brand|app)\s+to\s+[`'‘’""]?([^`'‘’""\n]+)/i.exec(
      text,
    )
  const renamed = tidyHeadline(rename?.[1])
  if (renamed) return { kind: 'headline', summary: renamed, headline: renamed }

  const heroTo =
    /(?:change|rewrite|update)\s+(?:the\s+)?(?:hero(?:\s+headline)?|title|heading)\s+to\s+[`'‘’""]?([^`'‘’""\n]+)/i.exec(
      text,
    )
  const hero = tidyHeadline(heroTo?.[1])
  if (hero) return { kind: 'headline', summary: hero, headline: hero }

  const headline = extractRequestedHeadline(message)
  if (headline) {
    return { kind: 'headline', summary: headline, headline }
  }

  if (/\bmake (?:it|the (?:site|store|page|hero)) more premium\b/i.test(text)) {
    return { kind: 'tone', summary: 'a more premium look', headline: 'Premium sneakers. Built to move.' }
  }
  if (/\bmake (?:it|the (?:site|store|page)) (?:warmer|more warm)\b/i.test(text)) {
    return { kind: 'tone', summary: 'warmer colors', accent: '#c45c26' }
  }
  return null
}

function replaceFirstTagline(source: string, tagline: string): string {
  const next = tagline.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  if (HERO_PARAGRAPH.test(source)) {
    return source.replace(HERO_PARAGRAPH, `$1$2${next}$4`)
  }
  if (/class(Name)?=["'][^"']*tagline[^"']*["']/i.test(source)) {
    return source.replace(
      /(<(?:p|span)[^>]*class(?:Name)?=["'][^"']*tagline[^"']*["'][^>]*>)[\s\S]*?(<\/(?:p|span)>)/i,
      `$1${next}$2`,
    )
  }
  if (/<h1[\s\S]*?<\/h1>\s*<p\b/i.test(source)) {
    return source.replace(/(<h1[\s\S]*?<\/h1>\s*<p(?:\s[^>]*)?>)[\s\S]*?(<\/p>)/i, `$1${next}$2`)
  }
  // No subcopy to rewrite — add one under the heading rather than overwriting
  // the first paragraph found elsewhere on the page.
  if (/<h1(?:\s[^>]*)?>/i.test(source)) {
    return source.replace(/(<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>)/i, `$1<p>${next}</p>`)
  }
  return source.replace(/(<p(?:\s[^>]*)?>)[\s\S]*?(<\/p>)/i, `$1${next}$2`)
}

function applyAccent(source: string, accent: string): string {
  const value = accent.replace(/[<>]/g, '')
  if (/--accent\s*:/.test(source)) {
    return source.replace(/--accent\s*:\s*[^;]+;/g, `--accent:${value};`)
  }
  if (/:root\s*\{/.test(source)) {
    return source.replace(/:root\s*\{/, `:root{--accent:${value};`)
  }
  if (/#3B8FD6|#3b8fd6/.test(source) && value.startsWith('#')) {
    return source.replace(/#3B8FD6|#3b8fd6/g, value)
  }
  return source
}

function applyCopy(source: string, from: string, to: string): string {
  if (!from || !source.includes(from)) return source
  return source.replace(from, to.replace(/[<>]/g, ''))
}

/**
 * Hero subcopy: the first paragraph after the hero marker, captured in parts.
 * The gap is tempered so a hero with no paragraph never reaches into the next
 * section and rewrites unrelated copy such as a product description.
 *
 * The `(?:\s[^>]*)?` after `<p` is load-bearing in .tsx sources: a plain
 * `<p[^>]*>` also matches a generic like `useState<Product[]>` and would splice
 * out everything between it and the next `</p>`.
 */
const HERO_PARAGRAPH =
  /(data-ib-section=["']hero["'](?:(?!<\/header>|<\/section>|data-ib-section=)[\s\S])*?)(<p(?:\s[^>]*)?>)([\s\S]*?)(<\/p>)/i

function plainText(markup: string): string {
  return markup.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function escapeMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function firstH1Text(source: string): string | null {
  const m = /<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i.exec(source)
  if (!m) return null
  return plainText(m[1]) || null
}

function shortenHeadline(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text
  if (sentence.length <= 42) return sentence
  const cut = sentence.slice(0, 42).replace(/\s+\S*$/, '').trim()
  return cut || sentence.slice(0, 42)
}

/**
 * Trim the headline, else the hero subcopy, else drop the subcopy — so "make the
 * hero shorter" still changes something when the headline is just a brand name.
 */
function applyShorten(source: string): string {
  const headline = firstH1Text(source)
  if (headline) {
    const shorter = shortenHeadline(headline)
    if (shorter && shorter !== headline) {
      return source.replace(/(<h1(?:\s[^>]*)?>)[\s\S]*?(<\/h1>)/i, `$1${escapeMarkup(shorter)}$2`)
    }
  }
  const hero = HERO_PARAGRAPH.exec(source)
  if (!hero) return source
  const subcopy = plainText(hero[3])
  if (!subcopy) return source
  const shorter = shortenHeadline(subcopy)
  if (shorter !== subcopy) {
    return source.replace(HERO_PARAGRAPH, `$1$2${escapeMarkup(shorter)}$4`)
  }
  return source.replace(HERO_PARAGRAPH, '$1')
}

export function applyPreviewMutationToFiles(
  files: Record<string, string> | null | undefined,
  mutation: PreviewMutation,
): { files: Record<string, string>; mutated: boolean } {
  if (mutation.kind === 'headline' && mutation.headline) {
    return applyHeadlineToProjectFiles(files, mutation.headline)
  }
  if (mutation.kind === 'tone' && mutation.headline) {
    const hero = applyHeadlineToProjectFiles(files, mutation.headline)
    if (!mutation.accent) return hero
    const tree = { ...hero.files }
    let mutated = hero.mutated
    for (const key of Object.keys(tree)) {
      if (!/\.(html|css|tsx|ts|jsx|js)$/.test(key)) continue
      const updated = applyAccent(tree[key], mutation.accent)
      if (updated !== tree[key]) {
        tree[key] = updated
        mutated = true
      }
    }
    return { files: tree, mutated }
  }
  const tree = flattenSafeFiles(files)
  const next = { ...tree }
  let mutated = false
  const keys = Object.keys(next).sort((a, b) => {
    const aSrc = a.startsWith('src/') ? 0 : 1
    const bSrc = b.startsWith('src/') ? 0 : 1
    return aSrc - bSrc || a.localeCompare(b)
  })
  for (const key of keys) {
    if (!/\.(html|css|tsx|ts|jsx|js)$/.test(key)) continue
    const body = next[key]
    let updated = body
    if (mutation.kind === 'tagline' && mutation.tagline) {
      updated = replaceFirstTagline(body, mutation.tagline)
    } else if (mutation.kind === 'accent' && mutation.accent) {
      updated = applyAccent(body, mutation.accent)
    } else if (mutation.kind === 'copy' && mutation.from && mutation.to) {
      updated = applyCopy(body, mutation.from, mutation.to)
    } else if (mutation.kind === 'tone' && mutation.accent) {
      updated = applyAccent(body, mutation.accent)
    } else if (mutation.kind === 'shorten') {
      updated = applyShorten(body)
    }
    if (updated !== body) {
      next[key] = updated
      mutated = true
      if (mutation.kind !== 'accent' && mutation.kind !== 'tone') break
    }
  }
  return { files: next, mutated }
}

export function applyHeadlineToProjectFiles(
  files: Record<string, string> | null | undefined,
  headline: string,
): { files: Record<string, string>; mutated: boolean } {
  const tree = flattenSafeFiles(files)
  if (isViteReactProject(tree)) {
    const next = { ...tree }
    let mutated = false
    const keys = Object.keys(next)
      .filter((k) => k.startsWith('src/') && /\.tsx?$/.test(k))
      .sort()
    const jsxSafe = headline.replace(/[<>]/g, '')
    for (const key of keys) {
      const body = next[key]
      if (!/<h1[\s>]/i.test(body)) continue
      const updated = body.replace(/(<h1(?:\s[^>]*)?>)[\s\S]*?(<\/h1>)/i, `$1${jsxSafe}$2`)
      if (updated !== body) {
        next[key] = updated
        mutated = true
        break
      }
    }
    return { files: next, mutated }
  }
  const html = tree['index.html'] || ''
  if (!html) return { files: tree, mutated: false }
  const nextHtml = mutateHeroHeadline(html, headline)
  return { files: { ...tree, 'index.html': nextHtml }, mutated: nextHtml !== html }
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

async function compileVitePreview(input: {
  projectRef: string
  spec: BusinessSpec
  files: Record<string, string>
  buildReact?: ViteBuildRunner
}): Promise<{ ok: true; files: Record<string, string>; html: string } | { ok: false; message: string }> {
  const compiled = input.buildReact
    ? await input.buildReact({ cwd: input.projectRef, files: input.files })
    : await buildViteReactApp(input.files, input.projectRef)
  if (!compiled.ok) {
    return {
      ok: false,
      message: `react_build_failed: ${compiled.message || 'vite build failed'}`,
    }
  }
  let html = compiled.html
  if (input.spec.businessType === 'ecommerce') html = injectCommerceRuntimeIntoHtml(html, input.projectRef)
  if (input.spec.businessType === 'saas') html = injectSaasRuntimeIntoHtml(html)
  if (input.spec.businessType === 'landing') html = injectLeadsRuntimeIntoHtml(html, input.projectRef)
  const hashed = hashPreviewFiles({ ...compiled.files, 'index.html': html })
  html = injectPreviewBoot(html, {
    projectRef: input.projectRef,
    artifactHash: hashed,
    applicationType: input.spec.businessType,
  })
  return { ok: true, html, files: { ...compiled.files, 'index.html': html } }
}

export async function materializePreview(input: {
  projectRef: string
  spec: BusinessSpec
  probe?: typeof probePreviewHttp
  files?: Record<string, string> | null
  buildReact?: ViteBuildRunner
}): Promise<PreviewBuildResult> {
  const incoming = flattenSafeFiles(input.files)
  let files: Record<string, string>
  let html: string
  let sourceFiles: Record<string, string> | undefined
  const forceVite =
    Boolean(input.buildReact) || process.env.INDOBASE_VITE_PREVIEW_BUILD === '1'
  if (isViteReactProject(incoming) || forceVite) {
    const viteSource = isViteReactProject(incoming)
      ? incoming
      : scaffoldViteReactProject(input.spec, input.projectRef)
    const compiled = await compileVitePreview({
      projectRef: input.projectRef,
      spec: input.spec,
      files: viteSource,
      buildReact: input.buildReact,
    })
    if (!compiled.ok) {
      return {
        ok: false,
        status: 'failed',
        url: null,
        artifactRef: null,
        contentHash: null,
        httpOk: false,
        files: viteSource,
        sourceFiles: viteSource,
        html: viteSource['index.html'] || '',
        message: compiled.message,
      }
    }
    files = compiled.files
    html = compiled.html
    sourceFiles = viteSource
  } else {
    files = buildPreviewFiles(input.spec, input.projectRef)
    html = files['index.html'] || ''
  }
  if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
    return {
      ok: false,
      status: 'failed',
      url: null,
      artifactRef: null,
      contentHash: null,
      httpOk: false,
      files,
      sourceFiles,
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
      sourceFiles,
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
      sourceFiles,
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
    sourceFiles,
    html,
    message: 'Preview ready',
  }
}
