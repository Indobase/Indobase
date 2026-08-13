/**
 * Guest vs signed-in access for Indobase OS bridge routes.
 *
 * Boundary (hard):
 * - Guests may browse, chat (begin-turn without consume), and complete OTP.
 * - Guests cannot publish / launch / ensure backends / burn paid or metered paths.
 * - Signed-in Free may continue (prompt meter applies after verify).
 *
 * Enforcement: every mutate route below must call requireSignedInSession
 * or requireSignedInSessionOrAgentTool in index.ts. This module is the
 * documented allow/deny catalog + helpers for consistent 403 bodies.
 */

/** Paths that must reject Guest / draft_* (403 account_required). */
export const OS_ACCOUNT_REQUIRED_PATHS = [
  // Launch / publish / domains
  '/api/os/runtime/ensure',
  '/api/os/deploy/publish',
  '/api/os/launch',
  '/api/os/apps/launch',
  '/api/os/tools/launchBusiness',
  '/api/os/tools/goLive',
  '/api/os/tools/launchProductionApp',
  '/api/os/domains/attach',
  // Metered / paid-adjacent
  '/api/os/usage/prompt-quota',
  '/api/os/auth/mail',
  // Payments
  '/api/os/payments/connect-gateway',
  '/api/os/payments/wire-checkout',
  '/api/os/tools/connectGateway',
  '/api/os/tools/connectPaymentGateway',
  '/api/os/tools/wireCheckout',
  '/api/os/tools/wirePricing',
  // Shop
  '/api/os/shop/catalog',
  '/api/os/shop/orders',
  '/api/os/tools/setupShopCatalog',
  '/api/os/tools/seedShopCatalog',
  '/api/os/tools/listShopOrders',
  '/api/os/tools/listShopCatalog',
  '/api/os/tools/placeTestShopOrder',
  '/api/os/tools/testShopCheckout',
  // Ensure / schema / production
  '/api/os/tools/ensureLogin',
  '/api/os/tools/enableLogin',
  '/api/os/tools/ensureDatabase',
  '/api/os/tools/ensureBusinessData',
  '/api/os/tools/ensureEmail',
  '/api/os/tools/enableEmail',
  '/api/os/tools/ensureAnalytics',
  '/api/os/tools/ensureEvents',
  '/api/os/tools/enableAnalytics',
  '/api/os/media/product-images',
  '/api/os/tools/resolveProductImages',
  '/api/os/tools/findProductImages',
  '/api/os/data/apply-schema',
  '/api/os/tools/applySchema',
  '/api/os/tools/guidedBackend',
  '/api/os/tools/runGuidedBackend',
  '/api/os/production/checklist',
  '/api/os/tools/productionChecklist',
  '/api/os/tools/claimProductionReady',
] as const

/** Read paths guests may call (session required, account not required). */
export const OS_GUEST_ALLOWED_READ_PATHS = [
  '/api/os/launch/status',
  '/api/session',
  '/api/os/runtime/agent-credentials',
  '/api/os/runtime/session-status',
  // Guests may begin-turn (no consume) so OTP signup chat is not blocked by the meter.
  '/api/os/agent/begin-turn',
  // Auth chrome + agent OTP (no account yet).
  '/auth/start',
  '/auth/verify',
  '/api/os/auth/claim-session',
] as const

/** Shared 403 body when a guest hits a signed-in-only path. */
export const ACCOUNT_REQUIRED_CODE = 'account_required' as const

export const ACCOUNT_REQUIRED_MESSAGE =
  'Create your Indobase account first — finish name + email + verification in chat (or Create account), then retry Launch / Enable.'

export function accountRequiredBody() {
  return {
    ok: false as const,
    code: ACCOUNT_REQUIRED_CODE,
    message: ACCOUNT_REQUIRED_MESSAGE,
  }
}

export function pathRequiresSignedInAccount(pathname: string): boolean {
  const path = pathname.split('?')[0] || pathname
  if (path === '/api/os/apps/launch' || path.startsWith('/api/os/apps/launch/')) return true
  return (OS_ACCOUNT_REQUIRED_PATHS as readonly string[]).includes(path)
}

export function pathAllowsGuestRead(pathname: string): boolean {
  const path = pathname.split('?')[0] || pathname
  return (OS_GUEST_ALLOWED_READ_PATHS as readonly string[]).includes(path)
}
