/**
 * Deterministic guided backend chain for Indobase OS (CFOS).
 *
 * After ecommerce / “Add a real backend” chips (or when live REST is needed), orchestrate:
 *   generic: ensureLogin → ensureDatabase → applySchema
 *   ecommerce: ensureDatabase → images + setupShopCatalog
 *   → optional launchBusiness when html/files provided
 *
 * Preview-first storefronts may exist before this chain. Progress messages are returned;
 * never invent live URLs.
 */

import { executeEnsureDatabase, executeEnsureLogin } from './ensure-capability-tool.js'
import { executeApplySchema } from './apply-schema-tool.js'
import { executeResolveProductImages } from './product-images-tool.js'
import { executeSetupShopCatalog, executePlaceTestShopOrder } from './shop-catalog-tool.js'
import { executeLaunchBusinessTool } from './launch-business-tool.js'
import {
  DEFAULT_GENERIC_SCHEMA_TABLES,
  ECOMMERCE_VERTICALS,
  findEcommerceVertical,
  type AppVertical,
  type VerticalSeedProduct,
} from './vertical-catalog.js'
import { getManagedBackendConfig, isManagedBackendConfigured } from './pocketbase/managed.js'
import {
  applyArchitectureBlueprint,
  listManagedShopSnapshot,
  placeManagedTestOrder,
  seedEcommerceCatalog,
  smokeProveArchitecture,
} from './pocketbase/architecture.js'
import { buildManagedShopAdminHtml } from './pocketbase/shop-admin-html.js'
import { buildManagedShopStorefrontHtml } from './pocketbase/shop-storefront-html.js'
import { autoWireLaunchArtifacts } from './wire-proof.js'
import type { BackendConfig } from './auth.js'

/** Openverse resolve budget on the ecommerce critical path (then placeholders). */
export const PRODUCT_IMAGES_TIMEOUT_MS = 8_000

export const GUIDED_BACKEND_TOOL = {
  name: 'guidedBackend',
  aliases: ['runGuidedBackend', 'autoBackend', 'guided_backend'] as const,
  description:
    'ENSURE-FIRST: generic → ensureLogin + ensureDatabase + applySchema; ecommerce → ensureDatabase + catalog. ' +
    'Call BEFORE building UI that needs auth or data. Optional placeTestShopOrder and launchBusiness when html is ready. Do not invent live URLs.',
  method: 'POST' as const,
  path: '/api/os/tools/guidedBackend',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        description: 'ecommerce | generic (default generic)',
      },
      vertical: {
        type: 'string',
        description: `Ecommerce vertical id: ${ECOMMERCE_VERTICALS.map((v) => v.id).join(', ')}`,
      },
      brand: { type: 'string' },
      place_test_order: { type: 'boolean', description: 'Prove inventory after catalog seed (default true for ecommerce)' },
      title: { type: 'string', description: 'Optional launchBusiness title' },
      subdomain: { type: 'string' },
      html: { type: 'string', description: 'When set, call launchBusiness after seed (real html only)' },
      files: { type: 'object', description: 'Optional launchBusiness files map' },
      admin_html_as: {
        type: 'string',
        description: 'If catalog returns admin_html, also publish as this path (default admin.html when launching)',
      },
    },
  },
} as const

export const GUIDED_BACKEND_AGENT_HARD_RULES = `
## Guided backend (HARD PATH — when live data is needed)

**LANDING SINGLE-TURN (HARD):** clear landing/marketing / "website for X" (no store/shop/backend ask) → build HTML and call **launchBusiness** \`app_type=landing\` in the **same turn**. Do **not** call guidedBackend. Do **not** ask continue/take-live micro-prompts. Skip PocketBase ecommerce.

**Preview-first is OK** for an **ambiguous** launch-store / landing ask: build the brand + UI first (localStorage cart fine), emit “Where should I take {Brand} next?”, then call **guidedBackend** when they pick **Add a real backend**, ask for login/data, or need live REST.

**AUTO-CHAIN (HARD):** when the operator says launch store/shop, add real backend, take live (with store/backend), or create admin → call **guidedBackend mode=ecommerce** + **placeTestShopOrder** in the **same turn** — do not emit preview-only niche chips (“Do NOT call guidedBackend yet”). Niche chips must use vertical ids from the catalog (apparel, electronics, food-grocery, beauty, …).

**Default store ladder (HARD order):** niche CHOICES (preview only) → preview FOLLOWUPS → Add a real backend → guidedBackend + placeTestShopOrder → publish **storefront_html** (Commerce ABI) → Go Live (launchBusiness) → Add payments (India/Razorpay ask) → connectGateway. Do not invent checkout APIs or PocketBase order POSTs.

When the product needs a real backend (SaaS/data, chip **Add a real backend**, or screens that hit project REST):

1. Call **guidedBackend** (seeds a **starter** saas/ecommerce boilerplate + secure rules) **BEFORE** wiring UI to a live API. Do not invent mock Neon/Firebase URLs.
2. Ecommerce: \`mode: "ecommerce"\` + \`vertical\`. Prove with placeTestShopOrder when available.
3. Then **customize** for this customer: call **applySchema** with extra/changed tables (or \`custom_only: true\` to skip re-seeding boilerplate). Shape orgs, inventory, bookings, etc. to match the product.
4. Prefer owner-scoped / authenticated write rules — never world-open writes.
5. After claim_backend_ready: emit FOLLOWUPS Go Live → Admin (≤4). Prefer **storefront_html** from guidedBackend — storefront must use **only** \`window.indobase.commerce\` (products/cart/checkout/orders). **FORBIDDEN:** hand-roll checkout, POST \`/api/collections/…/orders\`, trust browser price/stock. launchBusiness on Go Live with storefront_html or app_type=ecommerce. Ecommerce Go Live is a **release gate** (ApplicationContract verifiers); on \`contract_verifier_failed\` do not invent a URL — repair then retry.
6. Quote tool \`progress\` / \`message\`. ONLY claim a live URL when guidedBackend or launchBusiness returns ok + url.
7. Email / Analytics optional — do not block Go Live on them. After live url, offer **ensureAnalytics** chip (non-blocking).
8. Payments remain BYOK — guidedBackend does not skip KYC; hosted paymentUrl comes from commerce.checkout when gateway ready.
`.trim()

export type GuidedBackendStep = {
  id: string
  status: 'ok' | 'skipped' | 'failed' | 'pending'
  message: string
}

export type GuidedBackendInput = {
  mode?: string | null
  vertical?: string | null
  brand?: string | null
  place_test_order?: boolean | null
  title?: string | null
  subdomain?: string | null
  html?: string | null
  files?: Record<string, string> | null
  admin_html_as?: string | null
  /** Raw user chip / message for intent parsing */
  message?: string | null
}

export type GuidedBackendResult = {
  ok: boolean
  tool: 'guidedBackend'
  mode: 'ecommerce' | 'generic'
  vertical?: string
  brand?: string
  steps: GuidedBackendStep[]
  progress: string
  message: string
  claim_backend_ready: boolean
  claim_login_ready?: boolean
  backend?: {
    api_url: string
    anon_key: string
    auth_url?: string
    rest_url?: string
    storage_url?: string
    project_ref?: string
    project_name?: string
  }
  catalog_json?: unknown
  admin_html?: string
  /** Functional storefront via Commerce ABI — prefer this over agent localStorage HTML. */
  storefront_html?: string
  url?: string
  claim_live: boolean
  code?: string
}

export function guidedBackendToolCatalog() {
  return {
    name: GUIDED_BACKEND_TOOL.name,
    aliases: [...GUIDED_BACKEND_TOOL.aliases],
    description: GUIDED_BACKEND_TOOL.description,
    method: GUIDED_BACKEND_TOOL.method,
    path: GUIDED_BACKEND_TOOL.path,
    parameters: GUIDED_BACKEND_TOOL.parameters,
    rules: GUIDED_BACKEND_AGENT_HARD_RULES,
  }
}

/** Parse chip / user messages that should trigger the guided chain. */
export function parseGuidedBackendIntent(message: string | null | undefined): GuidedBackendInput | null {
  const text = (message || '').trim()
  if (!text) return null

  const marker = /INDOBASE_GUIDED_BACKEND\b/i.test(text)
  const addBackend = /add a real backend|call ensureDatabase then applySchema|guidedBackend/i.test(text)
  const ecommercePath =
    /this is an ecommerce store|mode\s*=\s*ecommerce|vertical\s*=\s*[\w-]+|seed .+ catalog/i.test(text)
  const launchStore =
    /\blaunch\s+(a\s+|my\s+)?(store|shop|business|ecommerce)\b/i.test(text) ||
    /\blaunch\b[\s\S]{0,80}\b(store|shop|business|ecommerce)\b/i.test(text)
  const createAdmin = /\b(create admin|shop admin|admin dashboard|publish admin_html)\b/i.test(text)
  const takeLiveWithBackend =
    (/\b(take\s+(it\s+)?live|go\s+live)\b/i.test(text) || /\btake\s+[\s\S]{0,40}\blive\b/i.test(text)) &&
    /store|shop|backend|catalog|inventory|ecommerce/i.test(text)

  if (!marker && !addBackend && !ecommercePath && !launchStore && !createAdmin && !takeLiveWithBackend) {
    return null
  }

  let mode: 'ecommerce' | 'generic' = 'generic'
  if (/mode\s*=\s*ecommerce/i.test(text) || ecommercePath || launchStore || createAdmin || takeLiveWithBackend) {
    mode = 'ecommerce'
  }
  if (/mode\s*=\s*generic/i.test(text)) mode = 'generic'
  if (/setupShopCatalog|ecommerce store|vertical\s*=/i.test(text) && !/mode\s*=\s*generic/i.test(text)) {
    mode = 'ecommerce'
  }
  // “Add a real backend” without shop cues → generic
  if (addBackend && !ecommercePath && !launchStore && !createAdmin && !/shop|store|ecommerce|catalog|vertical/i.test(text)) {
    mode = 'generic'
  }

  const verticalMatch = /vertical\s*=\s*([\w-]+)/i.exec(text)
  let vertical = verticalMatch?.[1] || null
  if (!vertical && mode === 'ecommerce') {
    const found = findEcommerceVertical(text)
    vertical = found?.id || null
  }

  const brandMatch = /brand\s*=\s*([^\n|,—]+)/i.exec(text)
  const brand = brandMatch?.[1]?.trim() || null

  const place_test_order =
    mode === 'ecommerce' &&
    (inputHasPlaceTestOrderTrue(text) ||
      launchStore ||
      createAdmin ||
      takeLiveWithBackend ||
      /place_test_order\s*=\s*true/i.test(text) ||
      !/place_test_order\s*=\s*false/i.test(text))

  return {
    mode,
    vertical,
    brand,
    message: text,
    ...(place_test_order ? { place_test_order: true } : {}),
  }
}

function inputHasPlaceTestOrderTrue(text: string): boolean {
  return /place_test_order\s*=\s*true/i.test(text) || /\bprove (with )?placeTestShopOrder\b/i.test(text)
}

function progressMarkdown(steps: GuidedBackendStep[]): string {
  const lines = ['### Guided backend progress']
  for (const step of steps) {
    const icon =
      step.status === 'ok' ? '✅' : step.status === 'failed' ? '❌' : step.status === 'skipped' ? '⏭️' : '…'
    lines.push(`${icon} **${step.id}** — ${step.message}`)
  }
  return lines.join('\n')
}

type SessionLike = { gotrueId: string; email: string; projectRef: string }

function seedProductsFromVertical(vertical: AppVertical): VerticalSeedProduct[] {
  return vertical.products ? [...vertical.products] : []
}

/** Brand-safe placeholder when Openverse times out or returns nothing. */
export function placeholderProductImageUrl(label: string): string {
  const text = encodeURIComponent((label || 'Product').trim().slice(0, 28) || 'Product')
  return `https://placehold.co/800x800/e8eef5/3B8FD6/png?text=${text}`
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(onTimeout()), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

type ProductImageResolveResult = Awaited<ReturnType<typeof executeResolveProductImages>> & {
  timed_out?: boolean
}

/** Critical-path imagery: wait up to timeout, then fall through for placeholders. */
export async function resolveProductImagesCriticalPath(
  session: SessionLike,
  products: VerticalSeedProduct[],
  timeoutMs: number = PRODUCT_IMAGES_TIMEOUT_MS,
): Promise<ProductImageResolveResult> {
  const queries = products.map((p) => p.image_query || p.name).filter(Boolean)
  if (!queries.length) {
    return {
      ok: false,
      tool: 'resolveProductImages',
      message: 'No product image queries',
      timed_out: false,
    } as ProductImageResolveResult
  }

  const pending = executeResolveProductImages(session, {
    queries,
    page_size: 2,
  })

  return withTimeout(
    pending.then((r) => ({ ...r, timed_out: false as const })),
    timeoutMs,
    () =>
      ({
        ok: false,
        tool: 'resolveProductImages' as const,
        message: `Image resolve timed out after ${timeoutMs}ms — using placeholders`,
        timed_out: true,
        results: [],
      }) as ProductImageResolveResult,
  )
}

function attachImageUrls(
  products: VerticalSeedProduct[],
  imageResult: { ok?: boolean; results?: Array<{ query?: string; urls?: string[] }> } | null,
  opts?: { placeholders?: boolean },
): Array<Record<string, unknown>> {
  const byQuery = new Map<string, string>()
  for (const row of imageResult?.results || []) {
    const q = (row.query || '').trim().toLowerCase()
    const url = row.urls?.[0]
    if (q && url) byQuery.set(q, url)
  }
  const usePlaceholders = opts?.placeholders !== false
  return products.map((p) => {
    const image_url =
      byQuery.get(p.image_query.toLowerCase()) ||
      byQuery.get(p.name.toLowerCase()) ||
      (usePlaceholders ? placeholderProductImageUrl(p.name) : undefined)
    return {
      slug: p.slug,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency,
      stock: p.stock,
      ...(image_url ? { image_url } : {}),
    }
  })
}

type EnsureBackendPayload = GuidedBackendResult['backend']

function backendPayloadFromEnsure(
  result: { backend?: EnsureBackendPayload | null; claim_login_ready?: boolean },
): EnsureBackendPayload | undefined {
  const b = result.backend
  if (!b?.api_url?.trim() || !b?.anon_key?.trim()) return undefined
  return {
    api_url: b.api_url,
    anon_key: b.anon_key,
    auth_url: b.auth_url,
    rest_url: b.rest_url,
    storage_url: b.storage_url,
    project_ref: b.project_ref,
    project_name: b.project_name,
  }
}

function backendConfigForWire(snapshot: EnsureBackendPayload, projectRef: string): BackendConfig | null {
  if (!snapshot?.api_url?.trim() || !snapshot?.anon_key?.trim()) return null
  const api = snapshot.api_url.replace(/\/+$/, '')
  const ref = snapshot.project_ref || projectRef
  const managed =
    snapshot.anon_key === 'public' ||
    snapshot.anon_key === 'indobase-backend' ||
    (snapshot.rest_url || '').includes('/api/collections')
  return {
    api_url: snapshot.api_url,
    anon_key: snapshot.anon_key,
    auth_url: snapshot.auth_url || (managed ? `${api}/api/collections/users` : `${api}/auth/v1`),
    rest_url: snapshot.rest_url || (managed ? `${api}/api/collections` : `${api}/rest/v1/`),
    storage_url: snapshot.storage_url || (managed ? `${api}/api/files` : `${api}/storage/v1`),
    project_ref: ref,
    project_name: snapshot.project_name || ref,
    public_env: managed
      ? {
          INDOBASE_BACKEND_KIND: 'records',
          INDOBASE_COLLECTION_PREFIX: `ib_${ref}_`,
          INDOBASE_RECORDS_BASE: `${api}/api/collections`,
        }
      : undefined,
  }
}

/**
 * Run the deterministic chain. Callers must pass a signed-in session.
 */
export async function executeGuidedBackend(
  session: SessionLike,
  input: GuidedBackendInput,
): Promise<GuidedBackendResult> {
  const parsed = input.message ? parseGuidedBackendIntent(input.message) : null
  const modeRaw = (input.mode || parsed?.mode || 'generic').toString().toLowerCase()
  const mode: 'ecommerce' | 'generic' = modeRaw === 'ecommerce' || modeRaw === 'shop' ? 'ecommerce' : 'generic'
  const verticalId = (input.vertical || parsed?.vertical || '').trim() || null
  const brand = (input.brand || parsed?.brand || '').trim() || undefined
  const steps: GuidedBackendStep[] = []
  let backendSnapshot: EnsureBackendPayload | undefined
  let claimLoginReady = false

  if (mode === 'generic') {
    const login = await executeEnsureLogin(session)
    if (!login.ok) {
      steps.push({
        id: 'ensureLogin',
        status: 'failed',
        message: login.message || 'Login ensure failed',
      })
      return failResult(mode, verticalId, brand, steps, login.code || 'login_required')
    }
    steps.push({
      id: 'ensureLogin',
      status: 'ok',
      message: login.message || 'Customer login ready',
    })
    claimLoginReady = Boolean(login.claim_login_ready)
    backendSnapshot = backendPayloadFromEnsure(login) ?? backendSnapshot
  }

  // ensureDatabase (all modes)
  const db = await executeEnsureDatabase(session)
  if (!db.ok) {
    steps.push({
      id: 'ensureDatabase',
      status: 'failed',
      message: db.message || 'Database ensure failed',
    })
    return failResult(mode, verticalId, brand, steps, db.code || 'database_required')
  }
  steps.push({
    id: 'ensureDatabase',
    status: 'ok',
    message: db.message || 'Customer database ready',
  })
  backendSnapshot = backendPayloadFromEnsure(db) ?? backendSnapshot

  let catalog_json: unknown
  let admin_html: string | undefined
  let storefront_html: string | undefined
  let storefrontProducts: Array<Record<string, unknown>> | undefined

  if (mode === 'ecommerce') {
    const vertical = findEcommerceVertical(verticalId) || ECOMMERCE_VERTICALS[0]
    const products = seedProductsFromVertical(vertical)

    // Start Openverse resolve in parallel with schema seed (critical path + timeout).
    const imagesPromise = resolveProductImagesCriticalPath(session, products)

    if (isManagedBackendConfigured()) {
      try {
        const applied = await applyArchitectureBlueprint({
          appId: session.projectRef,
          blueprint: 'ecommerce',
        })
        steps.push({
          id: 'architectureBoilerplate',
          status: 'ok',
          message: `Ecommerce starter schema seeded (${applied.collections.join(', ')}). Customize with applySchema as needed.`,
        })
      } catch (err) {
        steps.push({
          id: 'architectureBoilerplate',
          status: 'failed',
          message: err instanceof Error ? err.message : 'Starter schema failed',
        })
        return failResult(mode, vertical.id, brand, steps, 'architecture_failed')
      }
    }

    const imageResult = await imagesPromise
    const openverseHits = (imageResult.results || []).filter((r) => r.urls?.length).length
    steps.push({
      id: 'resolveProductImages',
      status: imageResult.ok || openverseHits > 0 ? 'ok' : imageResult.timed_out ? 'ok' : 'skipped',
      message: imageResult.timed_out
        ? `Image resolve timed out (${PRODUCT_IMAGES_TIMEOUT_MS}ms) — seeded with placeholders`
        : imageResult.ok || openverseHits > 0
          ? `Resolved commercial images for ${openverseHits}/${products.length} products (placeholders for the rest)`
          : imageResult.message || 'Image resolve skipped — seeding with placeholders',
    })

    const seeded = attachImageUrls(products, imageResult, { placeholders: true })

    // 3) setupShopCatalog — prefer managed backend seed when Studio shop API is unavailable
    let catalogOk = false
    if (isManagedBackendConfigured()) {
      const local = await seedEcommerceCatalog({
        appId: session.projectRef,
        ownerId: session.gotrueId,
        products: seeded.map((p) => ({
          slug: String(p.slug),
          name: String(p.name),
          description: typeof p.description === 'string' ? p.description : undefined,
          price: p.price as string | number,
          currency: typeof p.currency === 'string' ? p.currency : 'INR',
          stock: typeof p.stock === 'number' ? p.stock : 10,
          image_url: typeof p.image_url === 'string' ? p.image_url : undefined,
        })),
      })
      if (local.ok) {
        catalogOk = true
        catalog_json = local.catalog_json
        const config = getManagedBackendConfig()
        if (config) {
          const snapshot = await listManagedShopSnapshot({ appId: session.projectRef })
          const products = local.products?.length ? local.products : snapshot.ok ? snapshot.products : []
          storefrontProducts = products
          storefront_html = buildManagedShopStorefrontHtml({
            brand: brand || vertical.label,
            appId: session.projectRef,
            publicUrl: config.publicUrl,
            products,
          })
          if (snapshot.ok) {
            admin_html = buildManagedShopAdminHtml({
              brand: brand || vertical.label,
              appId: session.projectRef,
              publicUrl: config.publicUrl,
              products,
              orders: snapshot.orders,
            })
          }
        }
        steps.push({
          id: 'setupShopCatalog',
          status: 'ok',
          message: `Seeded ${vertical.label} catalog on Indobase backend`,
        })
      }
    }

    if (!catalogOk) {
      const catalog = await executeSetupShopCatalog(session, {
        brand: brand || vertical.label,
        products: seeded,
        action: 'setup',
      })
      if (!catalog.ok) {
        steps.push({
          id: 'setupShopCatalog',
          status: 'failed',
          message: catalog.message || 'Catalog seed failed',
        })
        return failResult(mode, vertical.id, brand, steps, catalog.code || 'catalog_failed')
      }
      steps.push({
        id: 'setupShopCatalog',
        status: 'ok',
        message: catalog.message || `Seeded ${vertical.label} catalog`,
      })
      catalog_json = catalog.catalog_json ?? catalog.products
      admin_html = typeof catalog.admin_html === 'string' ? catalog.admin_html : undefined
      const catalogProducts = Array.isArray(catalog.products)
        ? (catalog.products as Array<Record<string, unknown>>)
        : Array.isArray(seeded)
          ? (seeded as Array<Record<string, unknown>>)
          : undefined
      storefrontProducts = catalogProducts
      const config = getManagedBackendConfig()
      if (config && !storefront_html) {
        storefront_html = buildManagedShopStorefrontHtml({
          brand: brand || vertical.label,
          appId: session.projectRef,
          publicUrl: config.publicUrl,
          products: catalogProducts,
        })
      }
      catalogOk = true
    }

    // Ensure storefront shell exists even if admin snapshot was skipped.
    if (!storefront_html) {
      const config = getManagedBackendConfig()
      if (config) {
        storefront_html = buildManagedShopStorefrontHtml({
          brand: brand || vertical.label,
          appId: session.projectRef,
          publicUrl: config.publicUrl,
          products: storefrontProducts || seeded,
        })
      }
    }

    // 4) optional test order
    const placeTest = input.place_test_order !== false
    if (placeTest) {
      const slug = products[0]?.slug || ''
      if (slug && isManagedBackendConfigured()) {
        const test = await placeManagedTestOrder({
          appId: session.projectRef,
          ownerId: session.gotrueId,
          email: session.email || 'test@indobase.in',
          slug,
          cleanup: true,
        })
        steps.push({
          id: 'placeTestShopOrder',
          status: test.ok ? 'ok' : 'skipped',
          message: test.message,
        })
      } else if (slug) {
        const test = await executePlaceTestShopOrder(session, {
          order_email: session.email || 'test@indobase.in',
          items: [{ slug, quantity: 1 }],
          cleanup: true,
          brand: brand || vertical.label,
        })
        steps.push({
          id: 'placeTestShopOrder',
          status: test.ok ? 'ok' : 'skipped',
          message: test.ok
            ? test.message || 'Test order verified (stock restored)'
            : test.message || 'Test order skipped',
        })
        if (typeof test.admin_html === 'string') admin_html = test.admin_html
      } else {
        steps.push({
          id: 'placeTestShopOrder',
          status: 'skipped',
          message: 'No product slug for test order',
        })
      }
    }

    if (isManagedBackendConfigured()) {
      const smoke = await smokeProveArchitecture({
        appId: session.projectRef,
        blueprint: 'ecommerce',
      })
      steps.push({
        id: 'architectureSmoke',
        status: smoke.ok ? 'ok' : 'skipped',
        message: smoke.ok
          ? smoke.message
          : `${smoke.message} — catalog may still be usable; re-run guidedBackend or applySchema if writes fail.`,
      })
      // Soft-skip: collections + catalog seed already prove the store path.
    }

    return maybeLaunch(session, input, {
      mode,
      vertical: vertical.id,
      brand,
      steps,
      catalog_json,
      admin_html,
      storefront_html,
      storefront_products: storefrontProducts || seeded,
      backend: backendSnapshot,
      claim_login_ready: claimLoginReady,
    })
  }

  // generic: seed saas starter boilerplate, then agents customize with applySchema
  if (isManagedBackendConfigured()) {
    try {
      const applied = await applyArchitectureBlueprint({
        appId: session.projectRef,
        blueprint: 'saas',
      })
      steps.push({
        id: 'architectureBoilerplate',
        status: 'ok',
        message: `SaaS starter schema seeded (${applied.collections.join(', ')}). Customize with applySchema for this customer's product.`,
      })
      const smoke = await smokeProveArchitecture({
        appId: session.projectRef,
        blueprint: 'saas',
      })
      steps.push({
        id: 'architectureSmoke',
        status: smoke.ok ? 'ok' : 'skipped',
        message: smoke.ok
          ? smoke.message
          : `${smoke.message} — starter schema exists; customize with applySchema if needed.`,
      })
    } catch (err) {
      steps.push({
        id: 'architectureBoilerplate',
        status: 'failed',
        message: err instanceof Error ? err.message : 'Starter schema failed',
      })
      return failResult(mode, undefined, brand, steps, 'architecture_failed')
    }
  } else {
    const schema = await executeApplySchema(session, {
      brand: brand || 'App',
      tables: DEFAULT_GENERIC_SCHEMA_TABLES,
    })
    if (!schema.ok) {
      steps.push({
        id: 'applySchema',
        status: 'failed',
        message: schema.message || 'applySchema failed',
      })
      return failResult(mode, undefined, brand, steps, schema.code || 'schema_failed')
    }
    steps.push({
      id: 'applySchema',
      status: 'ok',
      message: schema.message || 'Default orgs/memberships schema applied',
    })
    if (typeof schema.admin_html === 'string') admin_html = schema.admin_html
  }

  return maybeLaunch(session, input, {
    mode,
    brand,
    steps,
    admin_html,
    backend: backendSnapshot,
    claim_login_ready: claimLoginReady,
  })
}

async function maybeLaunch(
  session: SessionLike,
  input: GuidedBackendInput,
  base: {
    mode: 'ecommerce' | 'generic'
    vertical?: string
    brand?: string
    steps: GuidedBackendStep[]
    catalog_json?: unknown
    admin_html?: string
    storefront_html?: string
    storefront_products?: Array<Record<string, unknown>>
    backend?: EnsureBackendPayload
    claim_login_ready?: boolean
  },
): Promise<GuidedBackendResult> {
  // Auto-wire admin / html with session.backend public_env; replace localStorage with managed storefront.
  if (base.backend) {
    const backendCfg = backendConfigForWire(base.backend, session.projectRef)
    const wired = autoWireLaunchArtifacts({
      html: input.html,
      files: input.files,
      admin_html: base.admin_html,
      storefront_html: base.storefront_html,
      backend: backendCfg,
      brand: base.brand || input.title,
      products: base.storefront_products,
      replaceUnwiredStorefront: base.mode === 'ecommerce',
    })
    if (wired.admin_html) base.admin_html = wired.admin_html
    if (wired.storefront_html) base.storefront_html = wired.storefront_html
    if (wired.html) input = { ...input, html: wired.html }
    if (wired.files) input = { ...input, files: wired.files }
    base.steps.push({
      id: 'wireProof',
      status: wired.wired || wired.admin_html || wired.storefront_html ? 'ok' : 'skipped',
      message: wired.message,
    })
  }

  let hasHtml = typeof input.html === 'string' && input.html.trim().length > 0
  let hasFiles = input.files && typeof input.files === 'object' && Object.keys(input.files).length > 0

  // Ecommerce: always publish managed storefront when backend is ready (even if agent omitted html).
  if (base.mode === 'ecommerce' && base.storefront_html && !hasHtml && !hasFiles) {
    input = { ...input, html: base.storefront_html, files: { 'index.html': base.storefront_html } }
    hasHtml = true
    hasFiles = true
    base.steps.push({
      id: 'managedStorefront',
      status: 'ok',
      message: 'Using managed Indobase storefront (live catalog + place order).',
    })
  }

  if (!hasHtml && !hasFiles) {
    base.steps.push({
      id: 'launchBusiness',
      status: 'skipped',
      message:
        'Publish skipped — call launchBusiness with storefront_html / real html/files when ready. Prefer *.sites.indobase.in over Gadget iframe (localStorage SecurityError). Do not invent a live URL.',
    })
    const progress = progressMarkdown(base.steps)
    const wireHint =
      base.mode === 'generic'
        ? 'Wire Sign-in + data to session.backend records API: physical collection = INDOBASE_COLLECTION_PREFIX + table; POST/GET {api}/api/collections/{physical}/records; OTP auth on users (Bearer user token). Do not use localStorage auth or /rest/v1.'
        : 'Publish storefront_html from this result (or call launchBusiness with it) — window.indobase.commerce only; never POST PocketBase orders. Prefer launchBusiness static preview over Gadget iframe.'
    return {
      ok: true,
      tool: 'guidedBackend',
      mode: base.mode,
      vertical: base.vertical,
      brand: base.brand,
      steps: base.steps,
      progress,
      message: `${progress}\n\nBackend ready (claim_backend_ready). NEXT: (1) ${wireHint} (2) emit FOLLOWUPS Wire → Go Live → Admin (3) launchBusiness on Go Live — do not invent a live URL. Payments only when they ask (BYOK Razorpay/Stripe).`,
      claim_backend_ready: true,
      claim_login_ready: base.claim_login_ready,
      backend: base.backend,
      catalog_json: base.catalog_json,
      admin_html: base.admin_html,
      storefront_html: base.storefront_html,
      claim_live: false,
    }
  }

  const files: Record<string, string> = { ...(input.files || {}) }
  if (hasHtml && !files['index.html']) {
    files['index.html'] = input.html!.trim()
  }
  // Prefer managed storefront for ecommerce index when agent HTML is still localStorage-only.
  if (base.mode === 'ecommerce' && base.storefront_html) {
    const indexText = files['index.html'] || ''
    if (
      !indexText ||
      (!/indobase\.commerce/.test(indexText) &&
        !/__INDOBASE_COLLECTION__\s*\(\s*['"]products['"]/.test(indexText))
    ) {
      files['index.html'] = base.storefront_html
    }
  }
  const adminPath = (input.admin_html_as || 'admin.html').replace(/^\/+/, '') || 'admin.html'
  if (base.admin_html && !files[adminPath]) {
    files[adminPath] = base.admin_html
  }

  const launched = await executeLaunchBusinessTool(
    session.projectRef,
    {
      title: input.title || base.brand || 'Indobase app',
      subdomain: input.subdomain || undefined,
      files,
      html: files['index.html'],
      app_type: base.mode === 'ecommerce' ? 'ecommerce' : 'saas',
      gotrueId: session.gotrueId,
      email: session.email,
    },
    base.backend
      ? {
          title: input.title || base.brand || undefined,
          backend: backendConfigForWire(base.backend, session.projectRef),
        }
      : undefined,
  )

  if (!launched.ok || !launched.claim_live || !launched.url) {
    base.steps.push({
      id: 'launchBusiness',
      status: 'failed',
      message: launched.message || 'Launch failed — do not invent a URL',
    })
    const progress = progressMarkdown(base.steps)
    return {
      ok: false,
      tool: 'guidedBackend',
      mode: base.mode,
      vertical: base.vertical,
      brand: base.brand,
      steps: base.steps,
      progress,
      message: `${progress}\n\n${launched.message || 'Launch failed'}`,
      claim_backend_ready: true,
      catalog_json: base.catalog_json,
      admin_html: base.admin_html,
      storefront_html: base.storefront_html,
      claim_live: false,
      code: 'launch_failed',
    }
  }

  base.steps.push({
    id: 'launchBusiness',
    status: 'ok',
    message: `Live at ${launched.url}`,
  })
  const progress = progressMarkdown(base.steps)
  return {
    ok: true,
    tool: 'guidedBackend',
    mode: base.mode,
    vertical: base.vertical,
    brand: base.brand,
    steps: base.steps,
    progress,
    message: `${progress}\n\nYour business is live: ${launched.url}`,
    claim_backend_ready: true,
    claim_login_ready: base.claim_login_ready,
    backend: base.backend,
    catalog_json: base.catalog_json,
    admin_html: base.admin_html,
    storefront_html: base.storefront_html,
    url: launched.url,
    claim_live: true,
  }
}

function failResult(
  mode: 'ecommerce' | 'generic',
  vertical: string | null | undefined,
  brand: string | undefined,
  steps: GuidedBackendStep[],
  code: string,
): GuidedBackendResult {
  const progress = progressMarkdown(steps)
  const last = steps[steps.length - 1]
  return {
    ok: false,
    tool: 'guidedBackend',
    mode,
    vertical: vertical || undefined,
    brand,
    steps,
    progress,
    message: `${progress}\n\n${last?.message || 'Guided backend failed'}`,
    claim_backend_ready: false,
    claim_live: false,
    code,
  }
}

/** Detect vertical-ask agent messages for chip fallback. */
export function looksLikeEcommerceVerticalAsk(message: string): boolean {
  const text = message.toLowerCase()
  if (/where will customers pay|payments are live|finish payments/.test(text)) return false
  return (
    /what will (your|the) store sell|which vertical|apparel \/ fashion|what (kind of|type of) (products|goods)|pick a store niche|store category/.test(
      text,
    )
  )
}
