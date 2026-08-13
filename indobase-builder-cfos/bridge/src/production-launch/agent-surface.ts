/**
 * Frozen agent tool surface.
 *
 * Agents create the experience. Indobase owns the application.
 * Production ecommerce/SaaS/landing is launchProductionApp — implementation
 * primitives stay callable by the job, not chosen by the model.
 */

export const AGENT_FACING_TOOL_NAMES = [
  'launchProductionApp',
  'launchBusiness',
  'connectGateway',
  'productionChecklist',
  'promptQuota',
] as const

export type AgentFacingToolName = (typeof AGENT_FACING_TOOL_NAMES)[number]

/** Platform-owned — job/provisioner uses these. Agents must not pick them for production. */
export const PLATFORM_PRIMITIVE_TOOL_NAMES = [
  'guidedBackend',
  'ensureLogin',
  'ensureDatabase',
  'ensureEmail',
  'ensureAnalytics',
  'applySchema',
  'setupShopCatalog',
  'resolveProductImages',
  'placeTestShopOrder',
  'listShopOrders',
  'wireCheckout',
] as const

export type PlatformPrimitiveToolName = (typeof PLATFORM_PRIMITIVE_TOOL_NAMES)[number]

export const AGENT_SURFACE_HARD_RULES = `
## Agent tool surface (HARD — frozen)

Agents create the experience. Indobase owns the application.

For Launch a store / SaaS / landing / Go Live / take live: call **only launchProductionApp**
(\`POST /api/os/apps/launch\`). Do **not** decide whether guidedBackend, ensureDatabase,
applySchema, setupShopCatalog, placeTestShopOrder, or launchBusiness are needed — the job does.

**Agent-facing tools**
- launchProductionApp — production orchestrator (mandatory for LIVE)
- launchBusiness — **preview/draft only** (\`production: false\`). Custom domain CNAME after LIVE.
- connectGateway — BYOK payments **after** LIVE (operator keys; never invent PSP credentials)
- productionChecklist — reads job evidence; do not invent claim_production_ready
- promptQuota — Free allowance

**Platform-internal** (do not call for production ecommerce): guidedBackend, ensure*,
applySchema, setupShopCatalog, resolveProductImages, placeTestShopOrder, listShopOrders,
wireCheckout. The ecommerce job runs these internally.

The payment state machine is **not** an agent tool. Storefronts use the Commerce ABI only;
CheckoutService owns payment transitions behind a provider adapter (Razorpay/Stripe).

If the job returns \`awaiting_generate\`: write storefront HTML using **only**
\`window.indobase.commerce\` (cart UX may use localStorage; never price/stock/order/payment
authority), then POST the same jobId with html/files.

If blocked: quote failures[].repair_hint and retry the same jobId (max 3). Never invent a URL.
`.trim()
