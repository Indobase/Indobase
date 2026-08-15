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
import {
  PRODUCTION_CHECKLIST_AGENT_HARD_RULES,
  productionChecklistToolCatalog,
} from './production-checklist-tool.js'
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
  productionJobMatchesSpec,
  resolveAuthoritativeAppType,
  summarizeProductionLaunchJob,
  composeGenerateSkillsHint,
  blueprintForAppType,
  type ProductionLaunchJob,
} from './production-launch/index.js'
import { OS_ACHIEVEMENTS, OS_HOME_HEADLINE, OS_HOME_SUBHEAD } from './os-home.js'
import {
  UX_CONDUCTOR_AGENT_RULES,
  appTypeToKind,
  composeScreenHint,
  controlCenterNav,
  isStoreJourneyKind,
  projectCapabilities,
  resolveWorkspaceState,
} from './ux-conductor.js'
import { getWorkspaceScreen } from './ux-screen-store.js'
import type { BusinessRuntimeState } from '@indobase/platform'
import {
  composeRuntimeStateHint,
  toBusinessRuntimeState,
  type BusinessSnapshotSummary,
} from './ux/agent-truth.js'
import { getBusinessSpec, type BusinessSpec } from './ux/business-spec.js'
import { resolvePreviewGate, type PreviewStatus } from './ux/preview-gate.js'
import { getWorkspaceRuntime } from './ux/runtime-store.js'
import { composePresentation, executionHintFromPersistedPlan } from './ux/presentation.js'
import { getLatestExecutionPlan } from './ux/execution-store.js'

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
export function buildJourneyStateAppendix(
  session: Session,
  launch?: LaunchStatusSnapshot | null,
  previewStatus?: PreviewStatus,
): string {
  const paymentsReady = sessionLooksPaymentsReady(session)
  const journey = buildLaunchJourneyState(session, launch)
  const catalogReady = Boolean(launch?.catalogReady || journey.flags.is_backend_ready)
  const spec = getBusinessSpec(session.projectRef)
  const website = spec?.businessType === 'landing'
  const store = !spec || spec.businessType === 'ecommerce'
  const lines = [
    '## Journey state (session)',
    '## North star (HARD)',
    '- Loop: infer BusinessSpec → create a real preview → iterate → launchBusiness/launchProductionApp (same job) → operate from BusinessRuntimeState.',
    '- Preview is a hard gate. Never claim preview or LIVE unless BusinessRuntimeState says so.',
    '- After every completed stage: emit 1–3 next FOLLOWUPS in business language. Never name internals. Never restart guest/auth once signed in. Never ask them to refresh.',
  ]
  if (store) {
    lines.push(`- Catalog: ${catalogReady ? 'ready' : 'not ready'}`)
  }
  lines.push(
    `- Preview: ${previewStatus || (launch?.previewReady ? 'ready' : 'absent')}`,
    `- Journey stage: ${journey.current_stage}`,
    `- Preview policy: launchBusiness and launchProductionApp run the same production job. production:false is draft preview only. Claim LIVE only from BusinessRuntimeState.`,
  )
  if (journey.next_action) {
    lines.push(
      `- Journey next_action chip: **${journey.next_action.label}** — ${journey.next_action.message}`,
    )
  }
  if (journey.live_url) {
    lines.push(`- Live url: ${journey.live_url}`)
  }
  if (store) {
    lines.push('## Default store ladder (when building a shop)')
    lines.push(
      'After account: if niche/app type is unknown, emit CHOICES cards and wait. Do not invent Circuit Nest. Infer BusinessSpec only after they pick a card or name brand+vertical. Then create a reachable preview. On Launch / Go Live → launchBusiness or launchProductionApp. After LIVE: Domain / Add payments / checklist. ≤4 chips.',
    )
    if (catalogReady) {
      lines.push(
        '- Catalog is ready. Prefer chips: Launch (if not live) → Domain / Add payments / Checklist.',
      )
    } else {
      lines.push(
        '- Catalog is not ready. Do not claim the store is ready. Build preview or launch — the job provisions catalog.',
      )
    }
    if (paymentsReady) {
      lines.push('- Payments: keys appear configured — connectGateway already done; productionChecklist reads job evidence.')
    } else {
      lines.push(
        '- Payments: after LIVE, offer Add payments CHOICES (India/Razorpay vs Stripe) then connectGateway. Full launch includes a checkout path.',
      )
    }
  } else if (website) {
    lines.push('## Website ladder')
    lines.push(
      'After account: infer BusinessSpec (landing). Create a reachable preview. On Launch / Go Live → launchBusiness or launchProductionApp (same job). No store, catalog, or payments chips. After LIVE: operate from BusinessRuntimeState. ≤4 chips.',
    )
  } else {
    lines.push('## App ladder')
    lines.push(
      'After account: infer BusinessSpec (saas). Create a reachable preview. On Launch / Go Live → launchBusiness or launchProductionApp (same job). No store catalog chips.',
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

export function composeAgentHintForSession(
  session: Session,
  agentHint: string,
  truth?: {
    launch?: LaunchStatusSnapshot | null
    previewStatus?: PreviewStatus
    projectState?: string
    liveUrl?: string | null
    previewUrl?: string | null
    catalogReady?: boolean
    spec?: BusinessSpec | null
    snapshot?: BusinessSnapshotSummary | null
    runtime?: BusinessRuntimeState | null
    paymentsReady?: boolean
  },
): string {
  const guest = isGuestSession(session)
  const journey = buildJourneyStateAppendix(session, truth?.launch, truth?.previewStatus)
  const screenHint = composeScreenHint(getWorkspaceScreen(session.projectRef))
  const runtime =
    truth?.runtime ||
    toBusinessRuntimeState({
      projectState: truth?.projectState || 'empty',
      previewStatus: truth?.previewStatus || 'absent',
      previewUrl: truth?.previewUrl || null,
      liveUrl: truth?.liveUrl || null,
      catalogReady: Boolean(truth?.catalogReady),
      spec: truth?.spec || getBusinessSpec(session.projectRef),
      snapshot: truth?.snapshot || null,
      paymentsReady: truth?.paymentsReady,
      identity: {
        signedIn: !guest,
        email: session.email || null,
        displayName: profileDisplayName(session) || null,
      },
      business: {
        ref: session.projectRef,
        name: session.projectName || getBusinessSpec(session.projectRef)?.businessName || '',
        kind: 'unknown',
        state: truth?.projectState || 'empty',
      },
      workspace: { ref: session.projectRef, slug: session.orgSlug },
    })
  const truthHint = composeRuntimeStateHint(runtime)
  const specForHint = truth?.spec || getBusinessSpec(session.projectRef)
  const generateHint = composeGenerateSkillsHint(specForHint?.businessType || null)
  const agentHintBody = `${agentHint}\n\n${journey}\n\n${truthHint}\n\n${generateHint}\n\n${screenHint ? `${screenHint}\n\n` : ''}${UX_CONDUCTOR_AGENT_RULES}\n\n${AGENT_SURFACE_HARD_RULES}\n\n${LAUNCH_PRODUCTION_APP_AGENT_HARD_RULES}\n\n${CONNECT_GATEWAY_AGENT_HARD_RULES}\n\n${PRODUCTION_CHECKLIST_AGENT_HARD_RULES}`
  if (!guest) {
    return agentHintBody.startsWith('SIGNED-IN SESSION')
      ? agentHintBody
      : `${MEMBER_SESSION_HINT}\n\n${agentHintBody}`
  }
  return agentHintBody.startsWith('GUEST ACCOUNT GATE')
    ? agentHintBody
    : `${GUEST_ACCOUNT_FIRST_HINT}\n\n${agentHintBody}`
}

function buildAuthoritativeProject(
  session: Session,
  journey: ReturnType<typeof buildLaunchJourneyState>,
  job?: ProductionLaunchJob | null,
  launch?: LaunchStatusSnapshot | null,
) {
  const persisted = getWorkspaceRuntime(session.projectRef)
  const spec = persisted?.spec || getBusinessSpec(session.projectRef)
  const matchedJob = spec && job && productionJobMatchesSpec(job, spec) ? job : spec ? null : job || null
  const appType =
    resolveAuthoritativeAppType({ specType: spec?.businessType, jobType: matchedJob?.appType }) ||
    spec?.businessType ||
    matchedJob?.appType ||
    null
  const kind = appTypeToKind(appType)
  const paymentsReady = Boolean(journey.flags.is_payments_ready || sessionLooksPaymentsReady(session))
  const live = matchedJob?.status === 'live' || (Boolean(spec) ? false : journey.flags.is_live)
  const liveUrl = live ? matchedJob?.url || journey.live_url || null : null
  const preview = resolvePreviewGate({
    jobStatus: matchedJob?.status || null,
    artifactExists: Boolean(launch?.previewReady || persisted?.preview.artifactRef),
    published: Boolean(launch?.subdomain || launch?.customDomain),
    previewUrl: persisted?.preview.url || launch?.previewUrl || null,
    liveUrl,
    httpOk: persisted?.preview.httpOk ?? null,
  })
  const catalogReady = Boolean(
    matchedJob?.evidence?.catalog_seeded ||
      matchedJob?.evidence?.backend_ready ||
      launch?.catalogReady ||
      journey.flags.is_backend_ready ||
      (isStoreJourneyKind(kind) && preview.status === 'ready'),
  )
  const state = resolveWorkspaceState({
    live,
    liveUrl,
    previewUrl: preview.url,
    previewReady: preview.status === 'ready',
    previewStatus: preview.status,
    backendReady: catalogReady,
    paymentsReady,
    jobStatus: matchedJob?.status || null,
    appType,
    failureCode: matchedJob?.status === 'blocked' ? matchedJob.failures.at(-1)?.code : null,
  })
  const capabilities = projectCapabilities({
    appType,
    kind,
    backendReady: catalogReady,
    paymentsReady,
    contractCapabilityIds: matchedJob?.contract?.capabilities?.map((c) => c.id) || null,
  })
  return {
    state,
    kind,
    capabilities,
    nav: controlCenterNav(kind, capabilities),
    preview,
    catalogReady,
    liveUrl,
  }
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
  businessSnapshot?: BusinessSnapshotSummary | null
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
  const persistedRuntime = getWorkspaceRuntime(session.projectRef)
  const spec = persistedRuntime?.spec || getBusinessSpec(session.projectRef)
  const matchedProductionJob =
    input.productionJob && spec && !productionJobMatchesSpec(input.productionJob, spec)
      ? null
      : input.productionJob
  const catalogReady = Boolean(
    matchedProductionJob?.evidence?.catalog_seeded ||
      matchedProductionJob?.evidence?.backend_ready ||
      input.launchStatus?.catalogReady ||
      (isStoreJourneyKind(appTypeToKind(spec?.businessType)) &&
        Boolean(input.launchStatus?.previewReady || persistedRuntime?.preview.status === 'ready')),
  )
  const journey = buildLaunchJourneyState(session, {
    ...input.launchStatus,
    catalogReady: catalogReady || input.launchStatus?.catalogReady,
    ...(spec && input.productionJob && !matchedProductionJob
      ? { url: undefined, subdomain: undefined, customDomain: undefined }
      : {}),
  })
  const authority = buildAuthoritativeProject(session, journey, matchedProductionJob, input.launchStatus)
  const productionJob = matchedProductionJob
    ? {
        ...summarizeProductionLaunchJob(matchedProductionJob),
        stages: matchedProductionJob.stages,
        contract: matchedProductionJob.contract,
        intent: matchedProductionJob.intent,
      }
    : null
  const runtime = toBusinessRuntimeState({
    projectState: authority.state,
    previewStatus: authority.preview.status,
    previewUrl: authority.preview.url,
    liveUrl: authority.liveUrl,
    catalogReady: authority.catalogReady,
    spec,
    snapshot: input.businessSnapshot || null,
    events: persistedRuntime?.events.map((e) => ({
      at: e.at,
      kind: e.kind,
      message: e.message,
      commandId: e.commandId,
    })),
    paymentsReady: Boolean(
      journey.flags.is_payments_ready || sessionLooksPaymentsReady(session),
    ),
    identity: {
      signedIn: !guest,
      email: session.email || null,
      displayName: profileDisplayName(session) || null,
    },
    business: {
      ref: session.projectRef,
      name: spec?.businessName || session.projectName || '',
      kind: authority.kind,
      state: authority.state,
    },
    workspace: { ref: session.projectRef, slug: session.orgSlug },
    deployment: {
      status: matchedProductionJob?.status || null,
      jobId: matchedProductionJob?.jobId || null,
    },
    capabilities: [
      ...authority.capabilities.map((id) => ({
        id,
        enabled: true,
        status: 'ready' as const,
      })),
      ...Object.entries(persistedRuntime?.capabilities || {})
        .filter(([id]) => !authority.capabilities.includes(id))
        .map(([id, status]) => ({
          id,
          enabled: status === 'ready',
          status,
        })),
    ],
    jobs: matchedProductionJob
      ? [{ id: matchedProductionJob.jobId, status: matchedProductionJob.status }]
      : [],
  })
  const latestPlan = getLatestExecutionPlan(session.projectRef)
  const ux = composePresentation(runtime, {
    ...executionHintFromPersistedPlan(latestPlan, matchedProductionJob || null),
    guest,
  })

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
    agent_hint: composeAgentHintForSession(session, input.agentHint, {
      launch: {
        ...input.launchStatus,
        catalogReady,
      },
      previewStatus: authority.preview.status,
      projectState: authority.state,
      liveUrl: authority.liveUrl,
      previewUrl: authority.preview.url,
      catalogReady: authority.catalogReady,
      spec,
      snapshot: input.businessSnapshot || null,
      runtime,
      paymentsReady: runtime.health.paymentsReady,
    }),
    runtime,
    ux,
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
      generate: {
        mode: 'blueprint_skills',
        stack: 'vite-react-ts',
        skills: composeGenerateSkillsHint(spec?.businessType || productionJob?.appType || null),
        blueprint: spec?.businessType || productionJob?.appType
          ? blueprintForAppType((spec?.businessType || productionJob?.appType) as 'landing' | 'saas' | 'ecommerce')
          : null,
      },
      /** Prefer static lane over Gadget iframe after first HTML exists (HARD — localStorage SecurityError). */
      preview_policy:
        'HARD: launchBusiness and launchProductionApp enqueue executeProductionLaunchJob. production:false is draft preview only. Claim LIVE only from BusinessRuntimeState.live. Never tell the operator to use Gadget iframe preview.',
      draft_preview_path:
        authority.preview.status === 'ready' ? `/live/${session.projectRef}/` : null,
      enforce_static_over_gadget: true,
    },
    production_job: productionJob,
    project: {
      state: authority.state,
      kind: authority.kind,
      capabilities: authority.capabilities,
      nav: authority.nav,
    },
    preview: {
      status: authority.preview.status,
      url: authority.preview.url,
    },
    business: {
      spec,
      snapshot: input.businessSnapshot || null,
    },
    screen: getWorkspaceScreen(session.projectRef),
    home: {
      headline: OS_HOME_HEADLINE,
      subhead: OS_HOME_SUBHEAD,
      tiles: OS_ACHIEVEMENTS.filter((a) =>
        a.id.startsWith('launch-') && a.id !== 'go-live',
      ).map((a) => ({ id: a.id, label: a.label, prompt: a.prompt })),
    },
    payments: {
      connect_gateway: '/api/os/payments/connect-gateway',
      tool: '/api/os/tools/connectGateway',
      tool_alias: '/api/os/tools/connectPaymentGateway',
      rules: CONNECT_GATEWAY_AGENT_HARD_RULES,
      owner: 'platform_job',
      byok: true,
      governance: {
        gateway_not_ready: explainGovernanceGate({ code: 'gateway_not_ready' }),
        payments_byok_required: explainGovernanceGate({ code: 'payments_byok_required' }),
      },
    },
    shop: {
      catalog: '/api/os/shop/catalog',
      orders: '/api/os/shop/orders',
      owner: 'platform_job',
    },
    data: {
      owner: 'platform_job',
    },
    media: {
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
