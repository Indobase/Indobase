/**
 * Prove published HTML/files are wired to Indobase backend (not localStorage-only).
 * Also auto-inject session.backend public_env after guidedBackend (P1 wire-proof automation).
 * Env inject alone is NOT enough — content must fetch/POST records API (or use managed storefront).
 */

import { isManagedPublicKey, getManagedBackendConfig } from './pocketbase/managed.js'
import { buildManagedShopStorefrontHtml } from './pocketbase/shop-storefront-html.js'
import { injectCommerceRuntimeIntoHtml } from './ux/preview-artifact.js'
import type { BackendConfig } from './auth.js'
import { injectIndobaseEnvIntoLaunchContent } from './publish-env-inject.js'
import { explainGovernanceGate } from './governance-gates.js'

const ENV_MARKERS =
  /__INDOBASE_ENV__|INDOBASE_URL|INDOBASE_COMMERCE_URL|INDOBASE_COLLECTION_PREFIX|INDOBASE_RECORDS_BASE|\/api\/collections\/|\/api\/os\/commerce|ib_[a-z0-9]+_|VITE_INDOBASE_URL|NEXT_PUBLIC_INDOBASE_URL|auth-with-otp|request-otp|indobase\.commerce/i

/** Must call Commerce ABI or records API — not env JSON / COLLECTION_HINT alone. */
const LIVE_DATA_MARKERS =
  /window\.indobase\.commerce|indobase\.commerce\.(products|cart|checkout|orders)|\/api\/os\/commerce\/|__INDOBASE_COLLECTION__\s*\(\s*['"]products['"]\s*\)|__INDOBASE_COLLECTION__\s*\(\s*['"]orders['"]\s*\)|fetch\s*\(\s*[^;]{0,200}\/records/i

/** Ecommerce storefronts must checkout via Commerce service — not invent APIs. */
const COMMERCE_CHECKOUT_ABI =
  /indobase\.commerce\.checkout|commerce\.checkout\.create|\/api\/os\/commerce\/checkout/i

/**
 * Storefront inventing PocketBase order creates (POST …/orders…/records) without Commerce ABI.
 */
const FORBIDDEN_STOREFRONT_ORDER_WRITE =
  /(?:method\s*[:=]\s*['"]POST['"][\s\S]{0,220}(?:\/api\/collections\/[^"'\\\s]*orders|orders[^"'\\\s]*\/records)|(?:\/api\/collections\/[^"'\\\s]*orders|orders[^"'\\\s]*\/records)[\s\S]{0,220}method\s*[:=]\s*['"]POST['"]|fetch\s*\(\s*[^)]*orders[^)]*records[^)]*\)[\s\S]{0,80}POST)/i

const LOCAL_ONLY = /localStorage|sessionStorage/i

/** Client sending its own price/total into checkout (server must price). */
const CLIENT_PRICE_AUTHORITY =
  /(?:amountMinor|unitPrice|clientPrice)\s*[:=]\s*(?:[^;\n]{0,60}(?:localStorage|sessionStorage|cart\.total|item\.price|line\.price))|(?:localStorage|sessionStorage)\.getItem\([^)]*(?:total|price|amount)/i

/** Client mutating inventory / stock outside Commerce ABI. */
const CLIENT_STOCK_AUTHORITY =
  /(?:\/api\/collections\/[^"'\\\s]*products[^"'\\\s]*\/records|products[^"'\\\s]*\/records)[\s\S]{0,200}(?:PATCH|PUT|POST)/i

export function collectLaunchText(input: {
  html?: string | null
  files?: Record<string, string> | null
}): string {
  const parts: string[] = []
  if (typeof input.html === 'string' && input.html.trim()) parts.push(input.html)
  if (input.files && typeof input.files === 'object') {
    for (const [path, content] of Object.entries(input.files)) {
      if (typeof content !== 'string') continue
      if (/\.(html?|js|mjs|cjs|ts|tsx|jsx|json|env)$/i.test(path) || !path.includes('.')) {
        parts.push(content)
      }
    }
  }
  return parts.join('\n')
}

export function contentLooksLikeDataApp(text: string): boolean {
  if (!text.trim()) return false
  return /(add to cart|checkout|sign[\s-]?in|log[\s-]?in|dashboard|book now|appointment|products?|orders?|supabase|fetch\(|api_url|anon_key)/i.test(
    text,
  )
}

export function inferAppTypeFromContent(text: string): string | null {
  const t = text.toLowerCase()
  if (/(add to cart|checkout|product grid|sku|inventory|storefront)/i.test(t)) return 'ecommerce'
  if (/(book now|appointment|availability|calendar slot)/i.test(t)) return 'booking'
  if (/(dashboard|admin panel|metrics)/i.test(t)) return 'dashboard'
  if (/(sign[\s-]?in|log[\s-]?in|saas|workspace|organization)/i.test(t)) return 'saas'
  if (/(blog|article|cms|post)/i.test(t)) return 'blog'
  return null
}

export function contentHasLiveDataWire(text: string): boolean {
  return LIVE_DATA_MARKERS.test(text) && ENV_MARKERS.test(text)
}

export function contentHasCommerceCheckoutAbi(text: string): boolean {
  return COMMERCE_CHECKOUT_ABI.test(text)
}

export function contentHasForbiddenStorefrontCheckout(text: string): boolean {
  if (!text.trim()) return false
  if (contentHasCommerceCheckoutAbi(text)) return false
  return FORBIDDEN_STOREFRONT_ORDER_WRITE.test(text)
}

export function contentHasClientPriceAuthority(text: string): boolean {
  if (!text.trim()) return false
  return CLIENT_PRICE_AUTHORITY.test(text)
}

export function contentHasClientStockAuthority(text: string): boolean {
  if (!text.trim()) return false
  return CLIENT_STOCK_AUTHORITY.test(text)
}

const LEAD_FORM = /<form[\s>]/i
const LEADS_ABI = /indobase\.leads|\/api\/os\/leads/i
const FORM_WITH_ACTION = /<form[^>]*\saction=["']https?:\/\//i

/**
 * An enquiry form that posts nowhere is worse than no form at all: the visitor
 * believes they made contact and the owner never hears about it.
 */
export function landingFormIsDead(html: string | null | undefined): boolean {
  const text = html || ''
  if (!LEAD_FORM.test(text)) return false
  return !LEADS_ABI.test(text) && !FORM_WITH_ACTION.test(text)
}

export function contentNeedsCommerceAbi(text: string): boolean {
  return inferAppTypeFromContent(text) === 'ecommerce' && !contentHasCommerceCheckoutAbi(text)
}

export type WireProofResult =
  | { ok: true; wired: boolean }
  | { ok: false; code: 'wire_required'; message: string }

/**
 * When a backend is required, content must call live Indobase APIs.
 * Ecommerce: Commerce ABI checkout (not public PocketBase order creates).
 * Other apps: records API is fine. Env-only / localStorage-only fail.
 */
export function assertLaunchWireReady(input: {
  html?: string | null
  files?: Record<string, string> | null
  backend?: BackendConfig | null
  requireWire: boolean
}): WireProofResult {
  if (!input.requireWire) return { ok: true, wired: false }

  const text = collectLaunchText(input)
  if (!text.trim()) {
    return {
      ok: false,
      code: 'wire_required',
      message:
        'Go Live needs html/files wired to session.backend (INDOBASE_URL / __INDOBASE_ENV__ / Commerce ABI or /api/collections). Rebuild the UI against the Indobase backend, then launchBusiness again.',
    }
  }

  const hasEnv = ENV_MARKERS.test(text)
  const hasLive = LIVE_DATA_MARKERS.test(text)
  const onlyLocal = LOCAL_ONLY.test(text) && !hasLive
  const isShop = inferAppTypeFromContent(text) === 'ecommerce'
  const forbiddenCheckout = contentHasForbiddenStorefrontCheckout(text)
  const missingCommerce = contentNeedsCommerceAbi(text)

  if (forbiddenCheckout || missingCommerce || onlyLocal || !hasEnv || !hasLive) {
    const api = input.backend?.api_url || 'session.backend.api_url'
    const prefix =
      input.backend?.public_env?.INDOBASE_COLLECTION_PREFIX ||
      (input.backend?.project_ref ? `ib_${input.backend.project_ref}_` : 'ib_<project_ref>_')
    const governance = explainGovernanceGate({ code: 'wire_required' })
    const commerceHint =
      isShop || forbiddenCheckout || missingCommerce
        ? ' Ecommerce storefronts must use window.indobase.commerce (commerce.checkout.create → /api/os/commerce/checkout). Do not POST PocketBase /api/collections/…/orders. Prefer guidedBackend storefront_html.'
        : ''
    return {
      ok: false,
      code: 'wire_required',
      message:
        `${governance.message}${commerceHint} Use ${api} with collection prefix ${prefix}` +
        (isShop
          ? ` and Commerce runtime (${api.replace(/\/+$/, '')}/api/os/commerce/…).`
          : ` (GET/POST ${api.replace(/\/+$/, '')}/api/collections/{prefix}{table}/records).`) +
        (isManagedPublicKey(input.backend?.anon_key)
          ? ' Auth via users OTP + Bearer user token (no Kong anon key).'
          : '') +
        ' Prefer the managed storefront from guidedBackend (storefront_html) or launchBusiness *.sites.indobase.in — env inject alone is not enough.',
    }
  }

  return { ok: true, wired: true }
}

function resolvePublicUrl(backend: BackendConfig): string {
  const fromEnv =
    backend.public_env?.INDOBASE_URL ||
    backend.public_env?.INDOBASE_RECORDS_BASE?.replace(/\/api\/collections\/?$/, '') ||
    backend.api_url ||
    backend.project_url ||
    ''
  const managed = getManagedBackendConfig()?.publicUrl
  return (fromEnv || managed || '').replace(/\/+$/, '')
}

/**
 * After guidedBackend / before launchBusiness: inject __INDOBASE_ENV__ and commerce runtime.js.
 * Never replace a non-empty generated index.html. Template substitution is last-resort empty index only.
 */
export function autoWireLaunchArtifacts(input: {
  html?: string | null
  files?: Record<string, string> | null
  admin_html?: string | null
  storefront_html?: string | null
  backend?: BackendConfig | null
  brand?: string | null
  products?: Array<Record<string, unknown>> | null
  /** Opt-in last resort: replace empty index.html only. Default false. */
  replaceUnwiredStorefront?: boolean
}): {
  html?: string
  files?: Record<string, string>
  admin_html?: string
  storefront_html?: string
  wired: boolean
  replaced_storefront: boolean
  message: string
} {
  if (!input.backend?.api_url?.trim() || !input.backend.anon_key?.trim()) {
    return {
      html: input.html ?? undefined,
      files: input.files ?? undefined,
      admin_html: input.admin_html ?? undefined,
      storefront_html: input.storefront_html ?? undefined,
      wired: false,
      replaced_storefront: false,
      message: 'No session.backend — skip wire inject until ensureDatabase / guidedBackend completes.',
    }
  }

  const files: Record<string, string> = { ...(input.files || {}) }
  if (typeof input.admin_html === 'string' && input.admin_html.trim() && !files['admin.html']) {
    files['admin.html'] = input.admin_html.trim()
  }

  let storefront =
    typeof input.storefront_html === 'string' && input.storefront_html.trim()
      ? input.storefront_html.trim()
      : undefined

  const publicUrl = resolvePublicUrl(input.backend)
  const appId = input.backend.project_ref || 'app'
  const allowReplace = input.replaceUnwiredStorefront === true
  if (!storefront && publicUrl && allowReplace) {
    storefront = buildManagedShopStorefrontHtml({
      brand: input.brand || undefined,
      appId,
      publicUrl,
      products: input.products || undefined,
    })
  }

  let html =
    typeof input.html === 'string' && input.html.trim() ? input.html.trim() : undefined
  if (html) html = injectCommerceRuntimeIntoHtml(html, appId)
  if (typeof files['index.html'] === 'string' && files['index.html'].trim()) {
    files['index.html'] = injectCommerceRuntimeIntoHtml(files['index.html'], appId)
  }

  let injected = injectIndobaseEnvIntoLaunchContent({
    html,
    files: Object.keys(files).length ? files : undefined,
    backend: input.backend,
  })
  // injectIndobaseEnvIntoLaunchContent prefers files and may omit html — restore index.
  if (!injected.html && typeof injected.files?.['index.html'] === 'string') {
    injected = { ...injected, html: injected.files['index.html'] }
  }

  let proof = assertLaunchWireReady({
    html: injected.html,
    files: injected.files,
    backend: input.backend,
    requireWire: Boolean(injected.html || (injected.files && Object.keys(injected.files).length)),
  })

  let replaced = false
  const indexMissing =
    !injected.html &&
    !(typeof injected.files?.['index.html'] === 'string' && injected.files['index.html'].trim())

  if (allowReplace && indexMissing && storefront) {
    replaced = true
    html = storefront
    const nextFiles = { ...(injected.files || {}) }
    nextFiles['index.html'] = storefront
    if (typeof input.admin_html === 'string' && input.admin_html.trim() && !nextFiles['admin.html']) {
      nextFiles['admin.html'] = input.admin_html.trim()
    }
    injected = injectIndobaseEnvIntoLaunchContent({
      html,
      files: nextFiles,
      backend: input.backend,
    })
    if (!injected.html && typeof injected.files?.['index.html'] === 'string') {
      injected = { ...injected, html: injected.files['index.html'] }
    }
    proof = assertLaunchWireReady({
      html: injected.html,
      files: injected.files,
      backend: input.backend,
      requireWire: true,
    })
  }

  const adminFromFiles =
    typeof injected.files?.['admin.html'] === 'string' ? injected.files['admin.html'] : undefined

  return {
    html: injected.html,
    files: injected.files,
    admin_html: adminFromFiles || (input.admin_html ?? undefined),
    storefront_html: storefront,
    wired: proof.ok === true && proof.wired === true,
    replaced_storefront: replaced,
    message: !proof.ok
      ? proof.message
      : replaced
        ? 'Filled empty index.html with a last-resort storefront shell.'
        : 'Injected session.backend public_env and commerce runtime without replacing the generated page.',
  }
}
