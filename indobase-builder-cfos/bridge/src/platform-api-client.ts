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
  isManagedBackendConfigured,
} from './pocketbase/managed.js'
import { managedBackendOtpStart, managedBackendOtpVerify } from './pocketbase/otp.js'
import {
  applyArchitectureBlueprint,
  smokeProveArchitecture,
} from './pocketbase/architecture.js'
import { inferBlueprintFromTables, resolveBlueprintId } from './pocketbase/blueprints.js'

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
  // Preferred path: managed Indobase backend (no Studio / GoTrue).
  if (isManagedBackendConfigured()) {
    const local = await managedBackendOtpStart({ name: input.name, email: input.email })
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
    const local = await managedBackendOtpVerify(input)
    if (local.ok) {
      return { ok: true, session: local.session }
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
        appId: input.workspaceRef,
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

/** Agent applySchema — declarative tables OR locked architecture blueprint. */
export async function platformApplySchema(input: {
  gotrueId: string
  email: string
  workspaceRef: string
  brand?: string | null
  tables?: Array<Record<string, unknown>> | null
  blueprint?: string | null
}): Promise<ApplySchemaResponse & { status?: number; claim_architecture_ready?: boolean }> {
  if (isManagedBackendConfigured()) {
    try {
      const blueprintId =
        (input.blueprint && resolveBlueprintId(input.blueprint)) ||
        inferBlueprintFromTables(input.tables)
      const applied = await applyArchitectureBlueprint({
        appId: input.workspaceRef,
        blueprint: blueprintId,
      })
      const smoke = await smokeProveArchitecture({
        appId: input.workspaceRef,
        blueprint: blueprintId,
      })
      if (!smoke.ok) {
        return {
          ok: false,
          message: smoke.message,
          tables: applied.collections,
          status: 502,
          claim_architecture_ready: false,
        }
      }
      return {
        ok: true,
        message: smoke.message,
        tables: applied.collections,
        status: 200,
        claim_architecture_ready: true,
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
  // Studio meter unavailable during platform pivot — do not block Builder when managed backend is live.
  if (isManagedBackendConfigured()) {
    return {
      ok: true,
      quota: {
        plan: 'pro',
        used: 0,
        remaining: null,
        limit: null,
        isFree: false,
        organization_slug: 'indobase',
        upgradeUrl: '',
      },
      httpStatus: 200,
    }
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
    return platformPromptQuotaGet(input)
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
