/**
 * Pure /api/session + /auth/verify response builders (testable without Hono).
 */
import type { OsPromptQuota } from '@indobase/platform-api'
import {
  GUEST_ACCOUNT_FIRST_HINT,
  LAUNCH_AGENT_HARD_RULES,
} from '@indobase/cloudflare-adapter'

import type { Session } from './auth.js'
import { isGuestSession } from './auth.js'
import {
  BUSINESS_OS_DISCOVERABLE_ACTIONS,
  discoverableActionsForSession,
} from './business-os-nav.js'
import {
  CONNECT_GATEWAY_AGENT_HARD_RULES,
  connectGatewayToolCatalog,
} from './connect-gateway-tool.js'
import { launchBusinessToolCatalog } from './launch-business-tool.js'
import {
  WIRE_CHECKOUT_AGENT_HARD_RULES,
  wireCheckoutToolCatalog,
} from './wire-checkout-tool.js'
import {
  SHOP_CATALOG_AGENT_HARD_RULES,
  listShopOrdersToolCatalog,
  placeTestShopOrderToolCatalog,
  setupShopCatalogToolCatalog,
} from './shop-catalog-tool.js'
import {
  ENSURE_CAPABILITY_AGENT_HARD_RULES,
  ensureAnalyticsToolCatalog,
  ensureDatabaseToolCatalog,
  ensureEmailToolCatalog,
  ensureLoginToolCatalog,
} from './ensure-capability-tool.js'
import {
  APPLY_SCHEMA_AGENT_HARD_RULES,
  applySchemaToolCatalog,
} from './apply-schema-tool.js'
import {
  GUIDED_BACKEND_AGENT_HARD_RULES,
  guidedBackendToolCatalog,
} from './guided-backend-chain.js'
import {
  PRODUCTION_CHECKLIST_AGENT_HARD_RULES,
  productionChecklistToolCatalog,
} from './production-checklist-tool.js'
import {
  PRODUCT_IMAGES_AGENT_HARD_RULES,
  resolveProductImagesToolCatalog,
} from './product-images-tool.js'
import {
  buildSessionPromptQuotaBlock,
  promptQuotaToolCatalog,
  type SessionPromptQuotaBlock,
} from './prompt-quota.js'

export type SessionOnboardingGate = {
  account_required: true
  gate: 'first'
  message: string
  auth: { start: string; verify: string; in_chat: true; ui: true }
}

export type SessionStage = 'guest' | 'member'

export function sessionStage(session: Session): SessionStage {
  return isGuestSession(session) ? 'guest' : 'member'
}

/** Detect BYOK gateway hints from session.backend.public_env when present. */
export function sessionLooksPaymentsReady(session: Session): boolean {
  const env = session.backend?.public_env
  if (!env || typeof env !== 'object') return false
  const blob = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
    .toLowerCase()
  return /razorpay|stripe|gateway_keys|payments_ready|checkout_ready/.test(blob)
}

/**
 * Compact Zero→One journey appendix for agent_hint (steers chips; does not invent UI cards).
 */
export function buildJourneyStateAppendix(session: Session): string {
  const backendReady = Boolean(session.backend?.api_url || session.backend?.rest_url)
  const paymentsReady = sessionLooksPaymentsReady(session)
  const lines = ['## Journey state (session)', `- Backend: ${backendReady ? 'ready' : 'not ready'}`]
  if (backendReady) {
    const ref = session.backend?.project_ref || session.projectRef
    lines.push(`- Backend project_ref: ${ref}`)
    lines.push(
      '- Prefer chips: wire storefront/admin to session.backend, Go Live (launchBusiness), Connect payments, Leave as-is — rewrite for brand; ≤4.',
    )
  } else {
    lines.push(
      '- Prefer path: preview-first → FOLLOWUPS (Go Live / Add a real backend / Refine / Leave as-is). Call guidedBackend only after backend chip/ask.',
    )
  }
  if (paymentsReady) {
    lines.push('- Payments: keys appear configured — prefer wireCheckout + productionChecklist when relevant.')
  } else {
    lines.push(
      '- Payments: not known from session — emit India vs Stripe CHOICES only when operator asks or picks Add payments.',
    )
  }
  return lines.join('\n')
}

export function buildOnboardingGate(session: Session): SessionOnboardingGate | null {
  if (!isGuestSession(session)) return null
  return {
    account_required: true,
    gate: 'first',
    message:
      'Acknowledge their request, then complete Indobase account via Continue with email (or in chat: name+email+DPDP → /auth/start → OTP → /auth/verify) before any other work.',
    auth: {
      start: '/auth/start',
      verify: '/auth/verify',
      in_chat: true,
      ui: true,
    },
  }
}

export function composeAgentHintForSession(session: Session, agentHint: string): string {
  const guest = isGuestSession(session)
  const journey = buildJourneyStateAppendix(session)
  const agentHintBody = `${agentHint}\n\n${journey}\n\n${LAUNCH_AGENT_HARD_RULES}\n\n${ENSURE_CAPABILITY_AGENT_HARD_RULES}\n\n${GUIDED_BACKEND_AGENT_HARD_RULES}\n\n${APPLY_SCHEMA_AGENT_HARD_RULES}\n\n${CONNECT_GATEWAY_AGENT_HARD_RULES}\n\n${WIRE_CHECKOUT_AGENT_HARD_RULES}\n\n${SHOP_CATALOG_AGENT_HARD_RULES}\n\n${PRODUCT_IMAGES_AGENT_HARD_RULES}\n\n${PRODUCTION_CHECKLIST_AGENT_HARD_RULES}`
  if (!guest) return agentHintBody
  return agentHintBody.startsWith('GUEST ACCOUNT GATE')
    ? agentHintBody
    : `${GUEST_ACCOUNT_FIRST_HINT}\n\n${agentHintBody}`
}

export type BuildSessionApiPayloadInput = {
  session: Session
  agentHint: string
  generation: unknown
  agentRuntimeConfigured: boolean
  agentRuntimeUrl: string | null
  osProxyPath: string
  indobaseProxyPath: string
  /** Live quota for signed-in operators; omit/null for guests. */
  promptQuota?: OsPromptQuota | null
}

export function buildSessionApiPayload(input: BuildSessionApiPayloadInput) {
  const { session } = input
  const guest = isGuestSession(session)
  const stage = sessionStage(session)
  const onboarding = buildOnboardingGate(session)
  const usage: SessionPromptQuotaBlock = buildSessionPromptQuotaBlock(
    guest ? null : input.promptQuota ?? null,
  )
  const actions = discoverableActionsForSession({ guest })

  return {
    email: session.email,
    guest,
    /** UI-readable session stage: guest (unsigned) | member (signed-in Free+). */
    stage,
    project_ref: session.projectRef,
    project_name: session.projectName,
    organization_slug: session.orgSlug,
    studio_url: session.studioUrl,
    backend: session.backend
      ? {
          api_url: session.backend.api_url,
          auth_url: session.backend.auth_url,
          rest_url: session.backend.rest_url,
          storage_url: session.backend.storage_url,
          project_ref: session.backend.project_ref,
          project_name: session.backend.project_name,
          anon_key: session.backend.anon_key,
        }
      : null,
    agent_runtime_configured: input.agentRuntimeConfigured,
    agent_runtime_url: input.agentRuntimeUrl,
    /** @deprecated internal — prefer agent_runtime_url */
    cloudflare_os_url: input.agentRuntimeUrl,
    os_proxy_path: input.osProxyPath,
    indobase_proxy_path: input.indobaseProxyPath,
    generation_context: input.generation,
    agent_hint: composeAgentHintForSession(session, input.agentHint),
    onboarding,
    auth: {
      start: '/auth/start',
      verify: '/auth/verify',
      in_chat: true,
      /** Deterministic Continue-with-email chrome is injected on the desktop. */
      ui: true,
      open_event: 'indobase:open-auth',
    },
    launch: {
      api: '/api/os/launch',
      domains_attach: '/api/os/domains/attach',
      status: '/api/os/launch/status',
      options: ['indobase_subdomain', 'custom_domain'],
      tool: '/api/os/tools/launchBusiness',
      tool_alias: '/api/os/tools/goLive',
      rules: LAUNCH_AGENT_HARD_RULES,
    },
    payments: {
      ensure: '/api/os/runtime/ensure',
      connect_gateway: '/api/os/payments/connect-gateway',
      wire_checkout: '/api/os/payments/wire-checkout',
      tool: '/api/os/tools/connectGateway',
      tool_alias: '/api/os/tools/connectPaymentGateway',
      wire_checkout_tool: '/api/os/tools/wireCheckout',
      rules: CONNECT_GATEWAY_AGENT_HARD_RULES,
      wire_checkout_rules: WIRE_CHECKOUT_AGENT_HARD_RULES,
    },
    shop: {
      catalog: '/api/os/shop/catalog',
      orders: '/api/os/shop/orders',
      setup_tool: '/api/os/tools/setupShopCatalog',
      list_orders_tool: '/api/os/tools/listShopOrders',
      place_test_tool: '/api/os/tools/placeTestShopOrder',
      rules: SHOP_CATALOG_AGENT_HARD_RULES,
    },
    data: {
      apply_schema: '/api/os/data/apply-schema',
      apply_schema_tool: '/api/os/tools/applySchema',
      guided_backend_tool: '/api/os/tools/guidedBackend',
      ensure_login_tool: '/api/os/tools/ensureLogin',
      ensure_database_tool: '/api/os/tools/ensureDatabase',
      ensure_email_tool: '/api/os/tools/ensureEmail',
      ensure_analytics_tool: '/api/os/tools/ensureAnalytics',
      rules: APPLY_SCHEMA_AGENT_HARD_RULES,
      guided_backend_rules: GUIDED_BACKEND_AGENT_HARD_RULES,
    },
    media: {
      product_images: '/api/os/media/product-images',
      tool: '/api/os/tools/resolveProductImages',
      rules: PRODUCT_IMAGES_AGENT_HARD_RULES,
    },
    production: {
      checklist: '/api/os/production/checklist',
      tool: '/api/os/tools/productionChecklist',
      rules: PRODUCTION_CHECKLIST_AGENT_HARD_RULES,
    },
    usage: {
      prompt_quota: usage.path,
      ...usage,
    },
    actions,
    command_palette: actions,
    discoverable_actions: BUSINESS_OS_DISCOVERABLE_ACTIONS,
    tools: {
      launchBusiness: launchBusinessToolCatalog(),
      ensureLogin: ensureLoginToolCatalog(),
      ensureDatabase: ensureDatabaseToolCatalog(),
      ensureEmail: ensureEmailToolCatalog(),
      ensureAnalytics: ensureAnalyticsToolCatalog(),
      applySchema: applySchemaToolCatalog(),
      guidedBackend: guidedBackendToolCatalog(),
      connectGateway: connectGatewayToolCatalog(),
      wireCheckout: wireCheckoutToolCatalog(),
      setupShopCatalog: setupShopCatalogToolCatalog(),
      listShopOrders: listShopOrdersToolCatalog(),
      placeTestShopOrder: placeTestShopOrderToolCatalog(),
      resolveProductImages: resolveProductImagesToolCatalog(),
      productionChecklist: productionChecklistToolCatalog(),
      promptQuota: promptQuotaToolCatalog(),
    },
  }
}

/** /auth/verify success body — clears guest onboarding for the next /api/session pull. */
export function buildAuthVerifySuccessPayload(session: Session, provisionState: string) {
  return {
    ok: true as const,
    guest: false as const,
    stage: 'member' as const,
    onboarding: null,
    project_ref: session.projectRef,
    email: session.email,
    organization_slug: session.orgSlug,
    provision_state: provisionState,
    next: '/',
    /** Hint for clients: re-fetch /api/session — guest gate is cleared. */
    session_ready: true,
  }
}

/** Browser claim after agent-side OTP verify — same stage semantics as verify. */
export function buildClaimSessionSuccessPayload(input: {
  email: string
  projectRef: string
}) {
  return {
    ok: true as const,
    upgraded: true as const,
    guest: false as const,
    stage: 'member' as const,
    session_ready: true as const,
    onboarding: null,
    email: input.email,
    project_ref: input.projectRef,
  }
}
