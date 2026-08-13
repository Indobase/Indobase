/**
 * Pure /api/session + /auth/verify response builders (testable without Hono).
 */
import type { OsPromptQuota } from '@indobase/platform-api'
import {
  GUEST_ACCOUNT_FIRST_HINT,
  MEMBER_SESSION_HINT,
  LAUNCH_AGENT_HARD_RULES,
} from '@indobase/cloudflare-adapter'

import type { Session } from './auth.js'
import { isGuestSession, profileDisplayName } from './auth.js'
import { buildLaunchJourneyState, type LaunchStatusSnapshot } from './launch-journey.js'
import {
  BUSINESS_OS_DISCOVERABLE_ACTIONS,
  discoverableActionsForSession,
} from './business-os-nav.js'
import {
  CONNECT_GATEWAY_AGENT_HARD_RULES,
  connectGatewayToolCatalog,
} from './connect-gateway-tool.js'
import { launchBusinessToolCatalog } from './launch-business-tool.js'
import { wireCheckoutToolCatalog } from './wire-checkout-tool.js'
import {
  listShopOrdersToolCatalog,
  placeTestShopOrderToolCatalog,
  setupShopCatalogToolCatalog,
} from './shop-catalog-tool.js'
import {
  ensureAnalyticsToolCatalog,
  ensureDatabaseToolCatalog,
  ensureEmailToolCatalog,
  ensureLoginToolCatalog,
} from './ensure-capability-tool.js'
import { applySchemaToolCatalog } from './apply-schema-tool.js'
import { guidedBackendToolCatalog } from './guided-backend-chain.js'
import {
  PRODUCTION_CHECKLIST_AGENT_HARD_RULES,
  productionChecklistToolCatalog,
} from './production-checklist-tool.js'
import { resolveProductImagesToolCatalog } from './product-images-tool.js'
import {
  buildSessionPromptQuotaBlock,
  promptQuotaToolCatalog,
  type SessionPromptQuotaBlock,
} from './prompt-quota.js'
import { explainGovernanceGate } from './governance-gates.js'
import {
  AGENT_SURFACE_HARD_RULES,
  LAUNCH_PRODUCTION_APP_AGENT_HARD_RULES,
  launchProductionAppToolCatalog,
  summarizeProductionLaunchJob,
  type ProductionLaunchJob,
} from './production-launch/index.js'
import { OS_ACHIEVEMENTS, OS_HOME_HEADLINE, OS_HOME_SUBHEAD } from './os-home.js'

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
export function buildJourneyStateAppendix(session: Session, launch?: LaunchStatusSnapshot | null): string {
  const backendReady = Boolean(session.backend?.api_url || session.backend?.rest_url)
  const paymentsReady = sessionLooksPaymentsReady(session)
  const journey = buildLaunchJourneyState(session, launch)
  const lines = [
    '## Journey state (session)',
    '## North star (HARD)',
    '- Always take the operator to a **production launch job** (POST /api/os/apps/launch) — not a chip ladder of ensure* tools.',
    '- After every completed stage: emit 2–4 next FOLLOWUPS. Never stop after 1–2 chip rounds. Never restart guest/auth once signed in.',
    `- Backend: ${backendReady ? 'ready' : 'not ready'}`,
    `- Journey stage: ${journey.current_stage}`,
    `- Preview policy: production LIVE is **launchProductionApp**. launchBusiness is preview/draft only (production:false).`,
  ]
  if (journey.next_action) {
    lines.push(
      `- Journey next_action chip: **${journey.next_action.label}** — ${journey.next_action.message}`,
    )
  }
  if (journey.live_url) {
    lines.push(`- Live url: ${journey.live_url}`)
  }
  lines.push('## Default store ladder (when building a shop)')
  lines.push(
    'Clear launch/store ask → launchProductionApp { appType:"ecommerce" }. The job owns guidedBackend + catalog + Commerce ABI + verify + deploy. After LIVE: Domain / Add payments / checklist. ≤4 chips; rewrite for brand.',
  )
  if (backendReady) {
    const ref = session.backend?.project_ref || session.projectRef
    lines.push(`- Backend project_ref: ${ref}`)
    lines.push(
      '- Prefer chips: Go Live via launchProductionApp → Domain / Add payments / Checklist. Do not call guidedBackend/ensure* yourself.',
    )
  } else {
    lines.push(
      '- Prefer path: launchProductionApp for production. Preview-only HTML may use launchBusiness production:false. Niche pick must NOT call guidedBackend.',
    )
  }
  if (paymentsReady) {
    lines.push('- Payments: keys appear configured — connectGateway already done; productionChecklist reads job evidence.')
  } else {
    lines.push(
      '- Payments: after LIVE, offer Add payments CHOICES (India/Razorpay vs Stripe) then connectGateway. Full launch includes a checkout path.',
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
      'Acknowledge their request, then complete Indobase account in chat (name+email+DPDP → /auth/start → OTP → /auth/verify) or via Create account before any other work.',
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
  const agentHintBody = `${agentHint}\n\n${journey}\n\n${AGENT_SURFACE_HARD_RULES}\n\n${LAUNCH_PRODUCTION_APP_AGENT_HARD_RULES}\n\n${CONNECT_GATEWAY_AGENT_HARD_RULES}\n\n${PRODUCTION_CHECKLIST_AGENT_HARD_RULES}`
  if (!guest) {
    return agentHintBody.startsWith('SIGNED-IN SESSION')
      ? agentHintBody
      : `${MEMBER_SESSION_HINT}\n\n${agentHintBody}`
  }
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
  launchStatus?: LaunchStatusSnapshot | null
  productionJob?: ProductionLaunchJob | null
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
  const journey = buildLaunchJourneyState(session, input.launchStatus)
  const productionJob = input.productionJob
    ? {
        ...summarizeProductionLaunchJob(input.productionJob),
        stages: input.productionJob.stages,
        contract: input.productionJob.contract,
        intent: input.productionJob.intent,
      }
    : null

  return {
    email: session.email,
    /** Operator display name for CFOS profile sync (OTP name or email local-part). */
    display_name: profileDisplayName(session) || null,
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
    journey,
    auth: {
      start: '/auth/start',
      verify: '/auth/verify',
      in_chat: true,
      /** Deterministic Create-account chrome is injected on the desktop. */
      ui: true,
      open_event: 'indobase:open-auth',
    },
    launch: {
      api: '/api/os/launch',
      domains_attach: '/api/os/domains/attach',
      status: '/api/os/launch/status',
      production: '/api/os/apps/launch',
      production_status: '/api/os/apps/launch/:jobId',
      options: ['indobase_subdomain', 'custom_domain'],
      tool: '/api/os/tools/launchBusiness',
      tool_alias: '/api/os/tools/goLive',
      production_tool: '/api/os/tools/launchProductionApp',
      rules: LAUNCH_AGENT_HARD_RULES,
      production_rules: LAUNCH_PRODUCTION_APP_AGENT_HARD_RULES,
      /** Prefer static lane over Gadget iframe after first HTML exists (HARD — localStorage SecurityError). */
      preview_policy:
        'HARD: Production LIVE is launchProductionApp (POST /api/os/apps/launch). launchBusiness is preview/draft only (production:false). Never tell the operator to use Gadget iframe preview.',
      draft_preview_path: journey.live_url ? null : `/live/${session.projectRef}/`,
      enforce_static_over_gadget: true,
    },
    production_job: productionJob,
    home: {
      headline: OS_HOME_HEADLINE,
      subhead: OS_HOME_SUBHEAD,
      tiles: OS_ACHIEVEMENTS.filter((a) =>
        a.id === 'launch-saas' || a.id === 'launch-store' || a.id === 'launch-landing',
      ).map((a) => ({ id: a.id, label: a.label, prompt: a.prompt })),
    },
    payments: {
      ensure: '/api/os/runtime/ensure',
      connect_gateway: '/api/os/payments/connect-gateway',
      wire_checkout: '/api/os/payments/wire-checkout',
      tool: '/api/os/tools/connectGateway',
      tool_alias: '/api/os/tools/connectPaymentGateway',
      wire_checkout_tool: '/api/os/tools/wireCheckout',
      rules: CONNECT_GATEWAY_AGENT_HARD_RULES,
      owner: 'platform_job',
      /** BYOK clarity — never invent hosted PSP credentials. */
      byok: true,
      governance: {
        gateway_not_ready: explainGovernanceGate({ code: 'gateway_not_ready' }),
        payments_byok_required: explainGovernanceGate({ code: 'payments_byok_required' }),
      },
    },
    shop: {
      catalog: '/api/os/shop/catalog',
      orders: '/api/os/shop/orders',
      setup_tool: '/api/os/tools/setupShopCatalog',
      list_orders_tool: '/api/os/tools/listShopOrders',
      place_test_tool: '/api/os/tools/placeTestShopOrder',
      owner: 'platform_job',
    },
    data: {
      apply_schema: '/api/os/data/apply-schema',
      apply_schema_tool: '/api/os/tools/applySchema',
      guided_backend_tool: '/api/os/tools/guidedBackend',
      ensure_login_tool: '/api/os/tools/ensureLogin',
      ensure_database_tool: '/api/os/tools/ensureDatabase',
      ensure_email_tool: '/api/os/tools/ensureEmail',
      ensure_analytics_tool: '/api/os/tools/ensureAnalytics',
      owner: 'platform_job',
    },
    media: {
      product_images: '/api/os/media/product-images',
      tool: '/api/os/tools/resolveProductImages',
      owner: 'platform_job',
    },
    production: {
      checklist: '/api/os/production/checklist',
      tool: '/api/os/tools/productionChecklist',
      rules: PRODUCTION_CHECKLIST_AGENT_HARD_RULES,
    },
    usage: {
      prompt_quota: usage.path,
      ...usage,
      governance: usage.exhausted
        ? explainGovernanceGate({
            code: 'prompt_quota_exceeded',
            upgradeUrl: usage.quota?.upgradeUrl,
          })
        : null,
    },
    governance: {
      account_required: explainGovernanceGate({ code: 'account_required' }),
      prompt_quota_exceeded: explainGovernanceGate({ code: 'prompt_quota_exceeded' }),
      gateway_not_ready: explainGovernanceGate({ code: 'gateway_not_ready' }),
      wire_required: explainGovernanceGate({ code: 'wire_required' }),
    },
    actions,
    command_palette: actions,
    discoverable_actions: BUSINESS_OS_DISCOVERABLE_ACTIONS,
    tools: {
      launchProductionApp: launchProductionAppToolCatalog(),
      launchBusiness: launchBusinessToolCatalog(),
      connectGateway: connectGatewayToolCatalog(),
      productionChecklist: productionChecklistToolCatalog(),
      promptQuota: promptQuotaToolCatalog(),
    },
    /** Implementation primitives — job-owned. Not for agent production decisions. */
    platform_primitives: {
      guidedBackend: guidedBackendToolCatalog(),
      ensureLogin: ensureLoginToolCatalog(),
      ensureDatabase: ensureDatabaseToolCatalog(),
      ensureEmail: ensureEmailToolCatalog(),
      ensureAnalytics: ensureAnalyticsToolCatalog(),
      applySchema: applySchemaToolCatalog(),
      setupShopCatalog: setupShopCatalogToolCatalog(),
      listShopOrders: listShopOrdersToolCatalog(),
      placeTestShopOrder: placeTestShopOrderToolCatalog(),
      resolveProductImages: resolveProductImagesToolCatalog(),
      wireCheckout: wireCheckoutToolCatalog(),
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
