/**
 * Bridge → headless Platform API client (Indobase OS Phase 1).
 */
import {
  OS_API_SECRET_HEADER,
  PlatformApiRoutes,
  type DeployPublishResponse,
  type OsAuthMailStatus,
  type OsPromptQuotaResponse,
  type OsWorkspaceSession,
  type PaymentsConnectGatewayResponse,
  type PaymentsWireCheckoutResponse,
  type RuntimeEnsureResponse,
  type ShopCatalogResponse,
  type ApplySchemaResponse,
  type ProductionChecklistResponse,
  type ProductImagesResponse,
  type WorkspaceUpdateResponse,
  type BillingUpgradePlanResponse,
} from '@indobase/platform-api'

import { resolveHandoffSecret } from './auth.js'
import { extractPlatformErrorMessage } from './auth-errors.js'
import {
  ensureManagedBackend,
  getManagedBackendConfig,
  isManagedBackendConfigured,
  sanitizeAppId,
} from './pocketbase/managed.js'
import {
  osWorkspaceFromIdentitySession,
  pocketBaseIdentityAdapter,
} from './pocketbase/identity-adapter.js'
import {
  applyArchitectureBlueprint,
  seedEcommerceCatalog,
  placeManagedTestOrder,
  smokeProveArchitecture,
  listManagedShopSnapshot,
} from './pocketbase/architecture.js'
import { buildManagedShopAdminHtml } from './pocketbase/shop-admin-html.js'
import { inferBlueprintFromTables, resolveBlueprintId } from './pocketbase/blueprints.js'

export { isManagedBackendConfigured } from './pocketbase/managed.js'

async function managedShopAdminHtml(options: {
  appId: string
  brand?: string | null
  products?: Array<Record<string, unknown>>
}): Promise<string | undefined> {
  const config = getManagedBackendConfig()
  if (!config) return undefined
  const snapshot = await listManagedShopSnapshot({ appId: options.appId })
  if (!snapshot.ok) return undefined
  return buildManagedShopAdminHtml({
    brand: options.brand || undefined,
    appId: options.appId,
    publicUrl: config.publicUrl,
    products: options.products?.length ? options.products : snapshot.products,
    orders: snapshot.orders,
  })
}

export function resolvePlatformApiUrl(): string {
  const raw =
    process.env.PLATFORM_API_URL?.trim() ||
    process.env.STUDIO_INTERNAL_URL?.trim() ||
    process.env.INDOBASE_STUDIO_INTERNAL_URL?.trim() ||
    process.env.STUDIO_URL?.trim() ||
    ''
  if (!raw) return ''
  return raw.replace(/\/+$/, '')
}

async function platformFetch(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const base = resolvePlatformApiUrl()
  if (!base) {
    return {
      status: 503,
      json: {
        message:
          'PLATFORM_API_URL is not configured on the bridge. Set it to the control plane base URL.',
      },
    }
  }

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch (err) {
    return {
      status: 503,
      json: { message: err instanceof Error ? err.message : 'Handoff secret not configured' },
    }
  }

  const controller = new AbortController()
  const timeoutMs = parseInt(process.env.PLATFORM_API_TIMEOUT_MS || '120000', 10)
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        [OS_API_SECRET_HEADER]: secret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, json }
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Platform API timed out'
        : err instanceof Error
          ? err.message
          : 'Platform API request failed'
    return { status: 502, json: { message } }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function platformOtpStart(input: {
  name: string
  email: string
  dpdpConsent: boolean
}): Promise<
  | { ok: true; email: string }
  | { ok: false; status: number; message: string; code?: string; retryAfterSeconds?: number }
> {
  // Preferred path: IdentityAdapter (PocketBase impl — never call PB HTTP here).
  if (isManagedBackendConfigured()) {
    const local = await pocketBaseIdentityAdapter.startOtp({
      name: input.name,
      email: input.email,
      dpdpConsent: input.dpdpConsent,
    })
    if (local.ok) {
      return { ok: true, email: local.email }
    }
    return { ok: false, status: local.status, message: local.message }
  }

  const { status, json } = await platformFetch(PlatformApiRoutes.identityOtpStart, {
    name: input.name,
    email: input.email,
    dpdpConsent: input.dpdpConsent,
  })
  if (status >= 200 && status < 300) {
    return { ok: true, email: typeof json?.email === 'string' ? json.email : input.email }
  }
  const extracted = extractPlatformErrorMessage(
    json,
    "Couldn't send the verification email. Please try again shortly.",
  )
  return {
    ok: false,
    status,
    message: extracted.message,
    code: extracted.code,
    retryAfterSeconds: extracted.retryAfterSeconds,
  }
}

export async function platformOtpVerify(input: {
  name: string
  email: string
  token: string
}): Promise<
  | { ok: true; session: OsWorkspaceSession }
  | { ok: false; status: number; message: string; code?: string; retryAfterSeconds?: number }
> {
  if (isManagedBackendConfigured()) {
    const local = await pocketBaseIdentityAdapter.verifyOtp(input)
    if (local.ok) {
      return { ok: true, session: osWorkspaceFromIdentitySession(local.session) }
    }
    return { ok: false, status: local.status, message: local.message }
  }

  const { status, json } = await platformFetch(PlatformApiRoutes.identityOtpVerify, {
    name: input.name,
    email: input.email,
    token: input.token,
  })
  if (status >= 200 && status < 300 && json?.session && typeof json.session === 'object') {
    return { ok: true, session: json.session as OsWorkspaceSession }
  }
  const extracted = extractPlatformErrorMessage(
    json,
    'Invalid or expired verification code. Request a new code and try again.',
  )
  return {
    ok: false,
    status,
    message: extracted.message,
    code: extracted.code,
    retryAfterSeconds: extracted.retryAfterSeconds,
  }
}

export async function platformRuntimeEnsure(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  capability: string
  /** india | international | razorpay | stripe — sets merchant settlement rail */
  settlementMarket?: string | null
}): Promise<RuntimeEnsureResponse & { status?: number; httpStatus?: number }> {
  const capability = input.capability.trim()

  // Login + business data → managed Indobase backend (no tenant data plane).
  if (
    isManagedBackendConfigured() &&
    (capability === 'login' ||
      capability === 'auth' ||
      capability === 'businessData' ||
      capability === 'database' ||
      capability === 'data')
  ) {
    try {
      const ensured = await ensureManagedBackend({
        appId: sanitizeAppId(input.workspaceRef),
        seed: input.email || input.workspaceRef,
      })
      const label = capability === 'login' || capability === 'auth' ? 'Login' : 'Customer database'
      return {
        ok: true,
        capability,
        status: 'enabled',
        provision_state: 'ready',
        backend: ensured.backend,
        message: `${label} enabled`,
        setup_status: 'ready',
        httpStatus: 200,
      }
    } catch (error) {
      return {
        ok: false,
        capability,
        provision_state: 'none',
        message: error instanceof Error ? error.message : 'Could not enable Indobase backend',
        httpStatus: 502,
      }
    }
  }

  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
    capability: input.capability,
  }
  if (input.settlementMarket?.trim()) {
    body.settlement_market = input.settlementMarket.trim()
  }
  const { status, json } = await platformFetch(PlatformApiRoutes.runtimeEnsure, body)
  if (json && typeof json === 'object') {
    // Do not overwrite RuntimeEnsureResponse.status ("enabled"|"enabling"|…)
    // with the HTTP status number — that breaks claim_*_ready checks.
    return { ...(json as RuntimeEnsureResponse), httpStatus: status }
  }
  return {
    ok: false,
    capability: input.capability,
    provision_state: 'none',
    message: 'Runtime ensure failed',
    httpStatus: status,
  }
}

/** BYOK: agent/operator pastes Razorpay or Stripe keys after PSP KYC. */
export async function platformPaymentsConnectGateway(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  settlementMarket: string
  keyId?: string | null
  keySecret?: string | null
  publishableKey?: string | null
  secretKey?: string | null
  webhookSecret?: string | null
}): Promise<PaymentsConnectGatewayResponse & { status?: number }> {
  if (isManagedBackendConfigured() && !resolvePlatformApiUrl()) {
    return {
      ok: false,
      message:
        'Payments connect requires the payments control plane. Configure PLATFORM_API_URL or connect gateway keys after Studio payments API is available.',
      status: 503,
    } as PaymentsConnectGatewayResponse & { status?: number }
  }

  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
    settlement_market: input.settlementMarket.trim(),
  }
  if (input.keyId?.trim()) body.key_id = input.keyId.trim()
  if (input.keySecret?.trim()) body.key_secret = input.keySecret.trim()
  if (input.publishableKey?.trim()) body.publishable_key = input.publishableKey.trim()
  if (input.secretKey?.trim()) body.secret_key = input.secretKey.trim()
  if (input.webhookSecret?.trim()) body.webhook_secret = input.webhookSecret.trim()

  const { status, json } = await platformFetch(
    PlatformApiRoutes.paymentsConnectGateway,
    body
  )
  if (json && typeof json === 'object') {
    return { ...(json as PaymentsConnectGatewayResponse), status }
  }
  return {
    ok: false,
    message: 'Connect gateway failed',
    status,
  }
}

/** Agent wireCheckout: plan + customer + hosted checkout_url. */
export async function platformPaymentsWireCheckout(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  planVersionId?: string | null
  planName?: string | null
  price?: string | null
  currency?: string | null
  billingPeriod?: string | null
  mode?: string | null
  customerId?: string | null
  customerName?: string | null
  customerEmail?: string | null
  expiresInHours?: number | null
}): Promise<PaymentsWireCheckoutResponse & { status?: number }> {
  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
  }
  if (input.planVersionId?.trim()) body.plan_version_id = input.planVersionId.trim()
  if (input.planName?.trim()) body.plan_name = input.planName.trim()
  if (input.price?.trim()) body.price = input.price.trim()
  if (input.currency?.trim()) body.currency = input.currency.trim()
  if (input.billingPeriod?.trim()) body.billing_period = input.billingPeriod.trim()
  if (input.mode?.trim()) body.mode = input.mode.trim()
  if (input.customerId?.trim()) body.customer_id = input.customerId.trim()
  if (input.customerName?.trim()) body.customer_name = input.customerName.trim()
  if (input.customerEmail?.trim()) body.customer_email = input.customerEmail.trim()
  if (typeof input.expiresInHours === 'number') body.expires_in_hours = input.expiresInHours

  const { status, json } = await platformFetch(PlatformApiRoutes.paymentsWireCheckout, body)
  if (json && typeof json === 'object') {
    return { ...(json as PaymentsWireCheckoutResponse), status }
  }
  return { ok: false, message: 'Wire checkout failed', status }
}

/** Agent setupShopCatalog / listShopCatalog. */
export async function platformShopCatalog(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  action?: 'setup' | 'list' | string | null
  brand?: string | null
  products?: Array<Record<string, unknown>> | null
}): Promise<ShopCatalogResponse & { status?: number }> {
  if (isManagedBackendConfigured()) {
    const appId = sanitizeAppId(input.workspaceRef)
    const action = (input.action || 'setup').toLowerCase()
    if (action === 'list') {
      const local = await seedEcommerceCatalog({
        appId,
        ownerId: input.gotrueId,
        products: [],
      })
      // list via seed with empty products still ensures collections; return ok shape
      if (!local.ok) {
        return { ok: false, message: local.message, status: 502 }
      }
      return {
        ok: true,
        message: 'Shop catalog on Indobase backend',
        products: local.products,
        catalog_json: local.catalog_json,
        admin_html: await managedShopAdminHtml({
          appId,
          brand: input.brand,
          products: local.products,
        }),
        status: 200,
      } as ShopCatalogResponse & { status?: number }
    }
    const products = Array.isArray(input.products)
      ? input.products.map((p) => ({
          slug: String(p.slug || ''),
          name: String(p.name || p.slug || 'Item'),
          description: typeof p.description === 'string' ? p.description : undefined,
          price: (p.price as string | number) ?? 0,
          currency: typeof p.currency === 'string' ? p.currency : 'INR',
          stock: typeof p.stock === 'number' ? p.stock : 10,
          image_url: typeof p.image_url === 'string' ? p.image_url : undefined,
        }))
      : []
    const local = await seedEcommerceCatalog({
      appId,
      ownerId: input.gotrueId,
      products: products.filter((p) => p.slug),
    })
    if (!local.ok) {
      return { ok: false, message: local.message, status: 502 }
    }
    return {
      ok: true,
      message: input.brand
        ? `Seeded catalog for ${input.brand} on Indobase backend`
        : 'Seeded shop catalog on Indobase backend',
      products: local.products,
      catalog_json: local.catalog_json,
      admin_html: await managedShopAdminHtml({
        appId,
        brand: input.brand,
        products: local.products,
      }),
      status: 200,
    } as ShopCatalogResponse & { status?: number }
  }

  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
    action: input.action || 'setup',
  }
  if (input.brand?.trim()) body.brand = input.brand.trim()
  if (Array.isArray(input.products)) body.products = input.products

  const { status, json } = await platformFetch(PlatformApiRoutes.shopCatalog, body)
  if (json && typeof json === 'object') {
    return { ...(json as ShopCatalogResponse), status }
  }
  return { ok: false, message: 'Shop catalog failed', status }
}

/** Agent applySchema — boilerplate blueprint and/or custom tables (agents customize freely). */
export async function platformApplySchema(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  brand?: string | null
  tables?: Array<Record<string, unknown>> | null
  blueprint?: string | null
  /** When true, skip seeding a starter blueprint and only apply `tables`. */
  custom_only?: boolean | null
}): Promise<ApplySchemaResponse & { status?: number; claim_architecture_ready?: boolean }> {
  if (isManagedBackendConfigured()) {
    try {
      const { applyCustomTables } = await import('./pocketbase/architecture.js')
      const hasTables = Array.isArray(input.tables) && input.tables.length > 0
      const customOnly = input.custom_only === true
      const names: string[] = []

      // Starter boilerplate (optional) — not a lock; agents may extend afterward.
      if (!customOnly) {
        const blueprintId =
          (input.blueprint && resolveBlueprintId(input.blueprint)) ||
          (hasTables ? inferBlueprintFromTables(input.tables) : 'saas')
        const applied = await applyArchitectureBlueprint({
          appId: sanitizeAppId(input.workspaceRef),
          blueprint: blueprintId,
        })
        names.push(...applied.collections)
      }

      if (hasTables) {
        const custom = await applyCustomTables({
          appId: sanitizeAppId(input.workspaceRef),
          tables: input.tables!,
        })
        names.push(...custom.collections)
      }

      if (!names.length) {
        return {
          ok: false,
          message: 'Pass tables to customize, or a blueprint starter (saas|ecommerce|booking|blog|dashboard).',
          status: 400,
          claim_architecture_ready: false,
        }
      }

      const unique = [...new Set(names)]
      const blueprintId =
        (input.blueprint && resolveBlueprintId(input.blueprint)) ||
        (hasTables ? inferBlueprintFromTables(input.tables) : 'saas')
      const smoke = await smokeProveArchitecture({
        appId: sanitizeAppId(input.workspaceRef),
        blueprint: customOnly ? undefined : blueprintId,
        probe: true,
      })
      return {
        ok: true,
        message: hasTables
          ? customOnly
            ? `Custom schema ready (${unique.join(', ')}). Keep evolving with applySchema.`
            : `Schema ready — starter + custom (${unique.join(', ')}). Keep customizing with applySchema as the product evolves.`
          : `Starter schema ready (${unique.join(', ')}). Customize with applySchema tables for this customer's product.`,
        tables: unique,
        status: 200,
        claim_architecture_ready: smoke.ok === true,
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'applySchema failed',
        status: 502,
        claim_architecture_ready: false,
      }
    }
  }

  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
  }
  if (input.brand?.trim()) body.brand = input.brand.trim()
  if (Array.isArray(input.tables)) body.tables = input.tables
  if (input.blueprint?.trim()) body.blueprint = input.blueprint.trim()

  const { status, json } = await platformFetch(PlatformApiRoutes.dataApplySchema, body)
  if (json && typeof json === 'object') {
    return { ...(json as ApplySchemaResponse), status }
  }
  return { ok: false, message: 'applySchema failed', status }
}

/** Agent productionChecklist claim gate. */
export async function platformProductionChecklist(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  appType?: string | null
  liveUrl?: string | null
  brand?: string | null
  checks?: Record<string, unknown> | null
}): Promise<ProductionChecklistResponse & { status?: number }> {
  if (isManagedBackendConfigured()) {
    const hasLive =
      typeof input.liveUrl === 'string' &&
      /^https?:\/\//i.test(input.liveUrl.trim()) &&
      !/example\.|localhost|127\.0\.0\.1/i.test(input.liveUrl)
    const appType = (input.appType || '').toLowerCase()
    const needsBackend = ['saas', 'ecommerce', 'booking', 'blog', 'dashboard'].includes(appType)
    let backendOk = !needsBackend
    if (needsBackend) {
      try {
        const ensured = await ensureManagedBackend({
          appId: sanitizeAppId(input.workspaceRef),
          seed: input.email,
        })
        backendOk = Boolean(ensured.backend?.api_url)
        if (backendOk && appType) {
          const smoke = await smokeProveArchitecture({
            appId: sanitizeAppId(input.workspaceRef),
            blueprint: resolveBlueprintId(appType) || 'saas',
            probe: false,
          })
          backendOk = smoke.ok
        }
      } catch {
        backendOk = false
      }
    }
    const claim = hasLive && backendOk
    return {
      ok: claim,
      claim_production_ready: claim,
      message: claim
        ? 'Production checklist passed (Indobase backend + live URL).'
        : !hasLive
          ? 'Publish with launchBusiness and pass the real live URL before claiming production ready.'
          : 'Backend architecture incomplete — run guidedBackend / applySchema, wire UI, then re-check.',
      status: claim ? 200 : 400,
    } as ProductionChecklistResponse & { status?: number }
  }

  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
  }
  if (input.appType?.trim()) body.app_type = input.appType.trim()
  if (input.liveUrl?.trim()) body.live_url = input.liveUrl.trim()
  if (input.brand?.trim()) body.brand = input.brand.trim()
  if (input.checks && typeof input.checks === 'object') body.checks = input.checks

  const { status, json } = await platformFetch(PlatformApiRoutes.productionChecklist, body)
  if (json && typeof json === 'object') {
    return { ...(json as ProductionChecklistResponse), status }
  }
  return {
    ok: false,
    claim_production_ready: false,
    message: 'productionChecklist failed',
    status,
  }
}

/** Agent listShopOrders / placeTestShopOrder. */
export async function platformShopOrders(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  action?: 'list' | 'place' | 'test' | string | null
  brand?: string | null
  orderEmail?: string | null
  items?: Array<Record<string, unknown>> | null
  cleanup?: boolean | null
}): Promise<ShopCatalogResponse & { status?: number }> {
  if (isManagedBackendConfigured()) {
    const appId = sanitizeAppId(input.workspaceRef)
    const action = (input.action || 'list').toLowerCase()
    if (action === 'place' || action === 'test') {
      const first = Array.isArray(input.items) ? input.items[0] : null
      const slug =
        first && typeof first === 'object' && typeof first.slug === 'string' ? first.slug : ''
      if (!slug) {
        return { ok: false, message: 'Pass items[].slug for a test order', status: 400 }
      }
      const test = await placeManagedTestOrder({
        appId,
        ownerId: input.gotrueId,
        email: input.orderEmail || input.email,
        slug,
        cleanup: input.cleanup !== false,
      })
      return {
        ok: test.ok,
        message: test.message,
        status: test.ok ? 200 : 502,
      } as ShopCatalogResponse & { status?: number }
    }
    const snapshot = await listManagedShopSnapshot({ appId })
    if (!snapshot.ok) {
      return { ok: false, message: snapshot.message, status: 502 }
    }
    return {
      ok: true,
      message: snapshot.orders.length
        ? 'Shop orders snapshot from BusinessRuntimeState'
        : 'Shop orders snapshot from Indobase backend',
      products: snapshot.products,
      orders: snapshot.orders,
      catalog_json: snapshot.products,
      admin_html: await managedShopAdminHtml({
        appId,
        brand: input.brand,
        products: snapshot.products,
      }),
      status: 200,
    } as ShopCatalogResponse & { status?: number }
  }

  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
    action: input.action || 'list',
  }
  if (input.brand?.trim()) body.brand = input.brand.trim()
  if (input.orderEmail?.trim()) body.order_email = input.orderEmail.trim()
  if (Array.isArray(input.items)) body.items = input.items
  if (typeof input.cleanup === 'boolean') body.cleanup = input.cleanup

  const { status, json } = await platformFetch(PlatformApiRoutes.shopOrders, body)
  if (json && typeof json === 'object') {
    return { ...(json as ShopCatalogResponse), status }
  }
  return { ok: false, message: 'Shop orders failed', status }
}

export async function platformDeployPublish(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  reason?: string
  /** Static site files for Studio hosting (unifies with Builder publish path). */
  files?: Record<string, string> | null
  html?: string | null
  title?: string | null
  subdomain?: string | null
  customDomain?: string | null
  intent?: string | null
}): Promise<DeployPublishResponse & { status?: number }> {
  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
    reason: input.reason || 'os_launch',
    // Hosting-only: do not auto-ensure payments/login from launch content.
    required_capabilities: [],
  }
  if (input.title?.trim()) body.title = input.title.trim()
  if (input.subdomain?.trim()) body.subdomain = input.subdomain.trim()
  if (input.customDomain?.trim()) body.custom_domain = input.customDomain.trim()
  if (input.intent?.trim()) body.intent = input.intent.trim()
  if (input.html?.trim()) body.html = input.html
  if (input.files && typeof input.files === 'object') {
    body.files = input.files
    body.artifacts = input.files
  }

  const { status, json } = await platformFetch(PlatformApiRoutes.deployPublish, body)
  if (json && typeof json === 'object') {
    return { ...(json as DeployPublishResponse), status }
  }
  return {
    ok: false,
    status: 'failed',
    message: 'Could not go live — try Launch Business again.',
  }
}

/** Agent resolveProductImages — Openverse commercial URLs. */
export async function platformResolveProductImages(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  queries?: string[] | null
  pageSize?: number | null
}): Promise<ProductImagesResponse & { status?: number }> {
  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
  }
  if (Array.isArray(input.queries)) body.queries = input.queries
  if (typeof input.pageSize === 'number') body.page_size = input.pageSize

  const { status, json } = await platformFetch(PlatformApiRoutes.mediaProductImages, body)
  if (json && typeof json === 'object') {
    return { ...(json as ProductImagesResponse), status }
  }
  return { ok: false, message: 'product images failed', status }
}

/** Agent updateWorkspace — rename org / project. */
export async function platformWorkspaceUpdate(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  name?: string | null
  brand?: string | null
  organizationName?: string | null
  projectName?: string | null
}): Promise<WorkspaceUpdateResponse & { status?: number }> {
  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
  }
  if (input.name?.trim()) body.name = input.name.trim()
  if (input.brand?.trim()) body.brand = input.brand.trim()
  if (input.organizationName?.trim()) body.organization_name = input.organizationName.trim()
  if (input.projectName?.trim()) body.project_name = input.projectName.trim()

  const { status, json } = await platformFetch(PlatformApiRoutes.workspaceUpdate, body)
  if (json && typeof json === 'object') {
    return { ...(json as WorkspaceUpdateResponse), status }
  }
  return { ok: false, message: 'Workspace update failed', status }
}

/** Agent upgradePlan — Razorpay checkout for Indobase ladder. */
export async function platformBillingUpgradePlan(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  plan: string
  tier?: string | null
}): Promise<BillingUpgradePlanResponse & { status?: number }> {
  const body: Record<string, unknown> = {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
    plan: input.plan.trim(),
  }
  if (input.tier?.trim()) body.tier = input.tier.trim()

  const { status, json } = await platformFetch(PlatformApiRoutes.billingUpgradePlan, body)
  if (json && typeof json === 'object') {
    return { ...(json as BillingUpgradePlanResponse), status }
  }
  return { ok: false, message: 'Plan upgrade failed', status }
}

/** GET/POST product Auth OTP From (branded login mail). */
export async function platformAuthMail(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  mode?: 'indobase' | 'branded'
  fromEmail?: string
  fromName?: string
  consume?: boolean
}): Promise<OsAuthMailStatus & { httpStatus: number }> {
  const write = Boolean(input.mode || input.fromEmail || input.fromName || input.consume)
  if (!write) {
    const base = resolvePlatformApiUrl()
    if (!base) {
      return {
        ok: false,
        mode: 'indobase',
        from_email: '',
        from_name: '',
        branded: false,
        default_from_email: '',
        default_from_name: '',
        message: 'PLATFORM_API_URL is not configured on the bridge.',
        httpStatus: 503,
      }
    }
    let secret: string
    try {
      secret = resolveHandoffSecret()
    } catch (err) {
      return {
        ok: false,
        mode: 'indobase',
        from_email: '',
        from_name: '',
        branded: false,
        default_from_email: '',
        default_from_name: '',
        message: err instanceof Error ? err.message : 'Handoff secret not configured',
        httpStatus: 503,
      }
    }
    const params = new URLSearchParams({
      gotrue_id: input.gotrueId,
      email: input.email,
      workspace_ref: input.workspaceRef,
    })
    try {
      const res = await fetch(`${base}${PlatformApiRoutes.authMail}?${params}`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          [OS_API_SECRET_HEADER]: secret,
        },
      })
      const json = (await res.json().catch(() => null)) as OsAuthMailStatus | null
      if (json && typeof json === 'object') {
        return { ...json, httpStatus: res.status }
      }
      return {
        ok: false,
        mode: 'indobase',
        from_email: '',
        from_name: '',
        branded: false,
        default_from_email: '',
        default_from_name: '',
        message: 'Could not load login mail settings',
        httpStatus: res.status,
      }
    } catch (err) {
      return {
        ok: false,
        mode: 'indobase',
        from_email: '',
        from_name: '',
        branded: false,
        default_from_email: '',
        default_from_name: '',
        message: err instanceof Error ? err.message : 'Platform API request failed',
        httpStatus: 502,
      }
    }
  }

  const { status, json } = await platformFetch(PlatformApiRoutes.authMail, {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.fromEmail ? { from_email: input.fromEmail } : {}),
    ...(input.fromName ? { from_name: input.fromName } : {}),
  })
  if (json && typeof json === 'object') {
    return { ...(json as OsAuthMailStatus), httpStatus: status }
  }
  return {
    ok: false,
    mode: 'indobase',
    from_email: '',
    from_name: '',
    branded: false,
    default_from_email: '',
    default_from_name: '',
    message: 'Could not update login mail settings',
    httpStatus: status,
  }
}

/** Check (GET) or consume (POST) OS agent prompt quota on the Platform API. */
export async function platformPromptQuota(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  consume?: boolean
}): Promise<OsPromptQuotaResponse & { httpStatus: number }> {
  if (input.consume) {
    return platformPromptQuotaConsume(input)
  }
  return platformPromptQuotaGet(input)
}

export async function platformPromptQuotaGet(input: {
  gotrueId: string
  email: string
  workspaceRef: string
}): Promise<OsPromptQuotaResponse & { httpStatus: number }> {
  // Studio meter unavailable during platform pivot — use local managed meter.
  if (isManagedBackendConfigured()) {
    const { managedPromptQuotaGet } = await import('./managed-prompt-quota.js')
    return managedPromptQuotaGet(input)
  }

  const base = resolvePlatformApiUrl()
  if (!base) {
    return {
      ok: false,
      message: 'PLATFORM_API_URL is not configured on the bridge.',
      httpStatus: 503,
    }
  }

  let secret: string
  try {
    secret = resolveHandoffSecret()
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Handoff secret not configured',
      httpStatus: 503,
    }
  }

  const params = new URLSearchParams({
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
  })
  try {
    const res = await fetch(`${base}${PlatformApiRoutes.promptQuota}?${params}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        [OS_API_SECRET_HEADER]: secret,
      },
    })
    const json = (await res.json().catch(() => null)) as OsPromptQuotaResponse | null
    if (json && typeof json === 'object') {
      return { ...json, httpStatus: res.status }
    }
    return { ok: false, message: 'Could not load agent prompt quota', httpStatus: res.status }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Platform API request failed',
      httpStatus: 502,
    }
  }
}

export async function platformPromptQuotaConsume(input: {
  gotrueId: string
  email: string
  workspaceRef: string
}): Promise<OsPromptQuotaResponse & { httpStatus: number }> {
  if (isManagedBackendConfigured()) {
    const { managedPromptQuotaConsume } = await import('./managed-prompt-quota.js')
    return managedPromptQuotaConsume(input)
  }

  const { status, json } = await platformFetch(PlatformApiRoutes.promptQuota, {
    gotrue_id: input.gotrueId,
    email: input.email,
    workspace_ref: input.workspaceRef,
  })
  if (json && typeof json === 'object') {
    return { ...(json as OsPromptQuotaResponse), httpStatus: status }
  }
  return {
    ok: false,
    message: 'Could not consume agent prompt quota',
    httpStatus: status,
  }
}
