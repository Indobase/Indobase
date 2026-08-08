/**
 * Headless Platform API — OS-facing route paths and types.
 * Indobase OS bridge calls these; customers never see Studio.
 */
export const PLATFORM_API_PREFIX = '/api/os/v1' as const

export const OS_API_SECRET_HEADER = 'x-indobase-os-secret' as const

export const PlatformApiRoutes = {
  identityOtpStart: `${PLATFORM_API_PREFIX}/identity/otp/start`,
  identityOtpVerify: `${PLATFORM_API_PREFIX}/identity/otp/verify`,
  workspace: (ref: string) => `${PLATFORM_API_PREFIX}/workspace/${encodeURIComponent(ref)}`,
  runtimeEnsure: `${PLATFORM_API_PREFIX}/runtime/ensure`,
  deployPublish: `${PLATFORM_API_PREFIX}/deploy/publish`,
  /** GET/POST — OS agent usage shares Builder free-prompt meter */
  promptQuota: `${PLATFORM_API_PREFIX}/usage/prompt-quota`,
  /** GET/POST — product Auth OTP From (branded login mail) */
  authMail: `${PLATFORM_API_PREFIX}/auth/mail`,
  /** POST — BYOK Razorpay/Stripe API keys after PSP KYC */
  paymentsConnectGateway: `${PLATFORM_API_PREFIX}/payments/connect-gateway`,
  /** POST — create plan/customer/checkout session → checkout_url for site CTA */
  paymentsWireCheckout: `${PLATFORM_API_PREFIX}/payments/wire-checkout`,
  /** POST — ensure/seed/list shop catalog (tenant DB inventory) */
  shopCatalog: `${PLATFORM_API_PREFIX}/shop/catalog`,
  /** POST — list shop orders or place test order */
  shopOrders: `${PLATFORM_API_PREFIX}/shop/orders`,
  /** POST — declarative tables for any app data model */
  dataApplySchema: `${PLATFORM_API_PREFIX}/data/apply-schema`,
  /** POST — production-ready claim gate by app type */
  productionChecklist: `${PLATFORM_API_PREFIX}/production/checklist`,
  /** POST — resolve commercial stock image URLs for products */
  mediaProductImages: `${PLATFORM_API_PREFIX}/media/product-images`,
} as const

export type ProductImagesResponse = {
  ok: boolean
  message?: string
  code?: string
  images?: Array<Record<string, unknown>>
  by_query?: Record<string, Record<string, unknown> | null>
}

export type ApplySchemaResponse = {
  ok: boolean
  message?: string
  code?: string
  tables?: string[]
  statements_run?: number
  admin_html?: string
}

export type ProductionChecklistResponse = {
  ok: boolean
  claim_production_ready: boolean
  app_type?: string
  live_url?: string
  message?: string
  checks?: Array<{ id: string; required: boolean; passed: boolean; label: string }>
  missing?: string[]
  next_steps?: OsEnsureNextStep[]
}

export type ShopCatalogResponse = {
  ok: boolean
  message?: string
  code?: string
  products?: Array<Record<string, unknown>>
  orders?: Array<Record<string, unknown>>
  order?: Record<string, unknown>
  admin_html?: string
  catalog_json?: Array<Record<string, unknown>>
}

export type PaymentsConnectGatewayResponse = {
  ok: boolean
  message?: string
  gateway_keys_configured?: boolean
  gateway_connector_synced?: boolean
  gateway_key_hint?: string | null
  settlement_market?: 'india' | 'international'
  settlement_adapter?: 'stripe' | 'razorpay_route'
  can_go_live?: boolean
  next_steps?: OsEnsureNextStep[]
  code?: string
}

export type PaymentsWireCheckoutResponse = {
  ok: boolean
  message?: string
  checkout_url?: string
  session_id?: string
  plan_version_id?: string
  plan_id?: string
  customer_id?: string
  code?: string
  next_steps?: OsEnsureNextStep[]
  mode?: string
}

export type OsAuthMailStatus = {
  ok: boolean
  mode: 'indobase' | 'branded'
  from_email: string
  from_name: string
  branded: boolean
  default_from_email: string
  default_from_name: string
  message?: string
  code?: string
}

export type OsEnsureNextStep = {
  id: string
  label: string
  path?: string
}

export type OsPromptQuota = {
  plan: string
  used: number
  limit: number | null
  remaining: number | null
  isFree: boolean
  organization_slug: string
  upgradeUrl: string
}

export type OsPromptQuotaResponse = {
  ok: boolean
  quota?: OsPromptQuota
  code?: string
  message?: string
}

export type OsWorkspaceSession = {
  gotrue_id: string
  email: string
  workspace_ref: string
  organization_slug: string
  workspace_name: string
  provision_state: 'none' | 'provisioning' | 'ready'
  backend?: {
    anon_key: string
    api_url: string
    auth_url: string
    project_name: string
    project_ref: string
    project_url: string
    rest_url: string
    storage_url: string
  } | null
}

export type RuntimeEnsureRequest = {
  workspace_ref: string
  capability: string
  /**
   * Commerce only: india | international (aliases razorpay | stripe).
   * Sets the project merchant settlement rail from the operator’s choice.
   */
  settlement_market?: 'india' | 'international' | 'razorpay' | 'stripe' | string
  hints?: Record<string, unknown>
}

export type RuntimeEnsureResponse = {
  ok: boolean
  capability: string
  capabilityId?: string
  customer_label?: string
  /** enabled | enabling | failed | unsupported */
  status?: string
  provision_state: string
  backend?: OsWorkspaceSession['backend']
  /** Customer Enable copy — never provider names */
  message?: string
  /** Product handoff when ensure left setup unfinished (commerce/email) */
  launch_url?: string | null
  /** pending = backend ready, finish product setup; ready = fully live */
  setup_status?: 'pending' | 'ready'
  /** Soft follow-ups (e.g. brand login From after Login enabled) */
  next_steps?: OsEnsureNextStep[]
  /** Commerce: india | international after ensure */
  settlement_market?: 'india' | 'international'
  /** Commerce: stripe | razorpay_route (for agent wiring; not shown as Enable copy) */
  settlement_adapter?: 'stripe' | 'razorpay_route'
}

export type DeployPublishRequest = {
  workspace_ref: string
  reason?: string
}

export type DeployPublishResponse = {
  ok: boolean
  url?: string
  status: 'queued' | 'published' | 'failed'
  message?: string
}
