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

Agents express intent. The runtime owns execution. Do not add tools.

These five tools exist. Nothing else is callable:

- launchProductionApp — Launch / Go Live (store, app, or website)
- launchBusiness — draft preview only (\`production: false\`)
- connectGateway — payments after LIVE (operator keys only)
- productionChecklist — readiness evidence; do not invent ready
- promptQuota — Free allowance

If the customer wants accounts, catalog, checkout, or data: say that in business
language. The conductor / launch job enables the capability. Do not look for
another tool. Prefer BusinessRuntimeState for products, orders, and live/preview.

After LIVE, add products in Control Center (or ask in chat — operate from state).
Claim preview only when preview.status=ready and the preview URL is reachable.
Claim LIVE only when live.isLive and live.url are set.
`.trim()
