/**
 * Deterministic guided backend chain for Indobase OS (CFOS).
 *
 * After ecommerce / “Add a real backend” chips (or when live REST is needed), orchestrate:
 *   ensureDatabase → (ecommerce: images + setupShopCatalog) | (generic: applySchema)
 *   → optional launchBusiness when html/files provided
 *
 * Preview-first storefronts may exist before this chain. Progress messages are returned;
 * never invent live URLs.
 */

import { executeEnsureDatabase } from './ensure-capability-tool.js'
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

export const GUIDED_BACKEND_TOOL = {
  name: 'guidedBackend',
  aliases: ['runGuidedBackend', 'autoBackend', 'guided_backend'] as const,
  description:
    'ENSURE-FIRST: ensureDatabase → applySchema (generic) or resolveProductImages + setupShopCatalog (ecommerce). ' +
    'Call BEFORE building UI that needs data. Optional placeTestShopOrder and launchBusiness when html is ready. Do not invent live URLs.',
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

**Preview-first is OK** for a clear launch-store / landing ask: build the brand + UI first (localStorage cart fine), emit “Where should I take {Brand} next?”, then call **guidedBackend** when they pick **Add a real backend**, ask for login/data, or need live REST.

**Default store ladder (HARD order):** niche CHOICES (preview only) → preview FOLLOWUPS → Add a real backend → guidedBackend + placeTestShopOrder → Wire storefront → Go Live (launchBusiness) → Add payments (India/Razorpay ask) → connectGateway → wireCheckout. Do not skip wire or invent checkout URLs.

When the product needs a real backend (SaaS/data, chip **Add a real backend**, or screens that hit project REST):

1. Call **guidedBackend** (or ensureLogin + ensureDatabase + applySchema) **BEFORE** wiring UI to a live API. Do not invent mock Neon/Firebase URLs.
2. Ecommerce: \`mode: "ecommerce"\` + \`vertical\` (apparel, electronics, food-grocery, beauty, home, sports). Prove with placeTestShopOrder when available.
3. Generic apps: \`mode: "generic"\` — default orgs/memberships schema (or pass applySchema tables yourself).
4. After claim_backend_ready: emit FOLLOWUPS Wire storefront → Go Live → Admin (≤4). Wire catalog to session.backend first; launchBusiness when they Go Live; payments only when they ask/pick Add payments.
5. Quote tool \`progress\` / \`message\`. ONLY claim a live URL when guidedBackend or launchBusiness returns ok + url.
6. Email / Analytics optional — do not block Go Live on them.
7. Payments remain BYOK — guidedBackend does not skip KYC.
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
  catalog_json?: unknown
  admin_html?: string
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

  if (!marker && !addBackend && !ecommercePath) return null

  let mode: 'ecommerce' | 'generic' = 'generic'
  if (/mode\s*=\s*ecommerce/i.test(text) || ecommercePath) mode = 'ecommerce'
  if (/mode\s*=\s*generic/i.test(text)) mode = 'generic'
  if (/setupShopCatalog|ecommerce store|vertical\s*=/i.test(text) && !/mode\s*=\s*generic/i.test(text)) {
    mode = 'ecommerce'
  }
  // “Add a real backend” without shop cues → generic
  if (addBackend && !ecommercePath && !/shop|store|ecommerce|catalog|vertical/i.test(text)) {
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

  return { mode, vertical, brand, message: text }
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

function seedProductsFromVertical(vertical: AppVertical): VerticalSeedProduct[] {
  return vertical.products ? [...vertical.products] : []
}

function attachImageUrls(
  products: VerticalSeedProduct[],
  imageResult: { ok?: boolean; results?: Array<{ query?: string; urls?: string[] }> } | null,
): Array<Record<string, unknown>> {
  const byQuery = new Map<string, string>()
  for (const row of imageResult?.results || []) {
    const q = (row.query || '').trim().toLowerCase()
    const url = row.urls?.[0]
    if (q && url) byQuery.set(q, url)
  }
  return products.map((p) => {
    const image_url =
      byQuery.get(p.image_query.toLowerCase()) ||
      byQuery.get(p.name.toLowerCase()) ||
      undefined
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

type SessionLike = { gotrueId: string; email: string; projectRef: string }

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

  // 1) ensureDatabase
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

  let catalog_json: unknown
  let admin_html: string | undefined

  if (mode === 'ecommerce') {
    const vertical = findEcommerceVertical(verticalId) || ECOMMERCE_VERTICALS[0]
    const products = seedProductsFromVertical(vertical)

    // 2) resolveProductImages (best-effort)
    let imageResult: Awaited<ReturnType<typeof executeResolveProductImages>> | null = null
    try {
      imageResult = await executeResolveProductImages(session, {
        queries: products.map((p) => p.image_query),
        page_size: 2,
      })
      steps.push({
        id: 'resolveProductImages',
        status: imageResult.ok ? 'ok' : 'skipped',
        message: imageResult.ok
          ? `Resolved images for ${products.length} products`
          : imageResult.message || 'Image resolve skipped — seeding without image_url',
      })
    } catch (err) {
      steps.push({
        id: 'resolveProductImages',
        status: 'skipped',
        message: err instanceof Error ? err.message : 'Image resolve skipped',
      })
    }

    const seeded = attachImageUrls(products, imageResult)

    // 3) setupShopCatalog
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

    // 4) optional test order
    const placeTest = input.place_test_order !== false
    if (placeTest) {
      const first = Array.isArray(catalog.products) ? catalog.products[0] : null
      const slug =
        first && typeof first === 'object' && first && 'slug' in first
          ? String((first as { slug?: string }).slug || products[0]?.slug || '')
          : products[0]?.slug || ''
      if (slug) {
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

    return maybeLaunch(session, input, {
      mode,
      vertical: vertical.id,
      brand,
      steps,
      catalog_json,
      admin_html,
    })
  }

  // generic: applySchema with default tables
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

  return maybeLaunch(session, input, {
    mode,
    brand,
    steps,
    admin_html,
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
  },
): Promise<GuidedBackendResult> {
  const hasHtml = typeof input.html === 'string' && input.html.trim().length > 0
  const hasFiles = input.files && typeof input.files === 'object' && Object.keys(input.files).length > 0

  if (!hasHtml && !hasFiles) {
    base.steps.push({
      id: 'launchBusiness',
      status: 'skipped',
      message:
        'Publish skipped — call launchBusiness (or guidedBackend with html/files) when the storefront is ready. Do not invent a live URL.',
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
      message: `${progress}\n\nBackend ready (claim_backend_ready). NEXT (store ladder): (1) Wire storefront to catalog_json / session.backend (2) emit FOLLOWUPS Wire → Go Live → Admin (3) launchBusiness on Go Live — do not invent a live URL. Payments only when they ask.`,
      claim_backend_ready: true,
      catalog_json: base.catalog_json,
      admin_html: base.admin_html,
      claim_live: false,
    }
  }

  const files: Record<string, string> = { ...(input.files || {}) }
  if (hasHtml && !files['index.html']) {
    files['index.html'] = input.html!.trim()
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
      gotrueId: session.gotrueId,
      email: session.email,
    },
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
    catalog_json: base.catalog_json,
    admin_html: base.admin_html,
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
