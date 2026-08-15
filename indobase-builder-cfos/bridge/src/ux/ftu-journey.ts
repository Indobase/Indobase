/**
 * First-time user journey certification — ecommerce.
 * Not button UAT. Not another feature. Can a non-technical person
 * launch and operate a store without knowing Indobase internals?
 *
 * Live run is scripts/live-ftu-journey-cert.mjs against deployed CFOS.
 */
import { authorizeControlCenterAccess } from '../commerce/control-center-auth.js'
import { AGENT_FACING_TOOL_NAMES } from '../production-launch/agent-surface.js'
import {
  HOME_INTENTS,
  UX_HOME_HEADLINE,
  controlCenterNav,
  formatPreviewEditMessage,
  formatScreenMessage,
  humanizeLaunchFailure,
  projectCapabilities,
  resolveWorkspaceState,
  workspaceViewModel,
  type AuthoritativeProject,
  type WorkspaceProjectState,
} from '../ux-conductor.js'

export const FTU_CERT_VERSION = 'ftu-journey/v1' as const

/** Live release artifact — all 20 must be green with LOCAL + SECURITY before UX certified. */
export const FTU_LIVE_CERT_ITEMS = [
  { id: '01', label: 'Natural-language launch' },
  { id: '02', label: 'Correct business classification' },
  { id: '03', label: 'Preview generated' },
  { id: '04', label: 'Click-to-edit' },
  { id: '05', label: 'Mutation reflected in preview' },
  { id: '06', label: 'Production launch' },
  { id: '07', label: 'LIVE state' },
  { id: '08', label: 'session.project authority' },
  { id: '09', label: 'Contract-derived navigation' },
  { id: '10', label: 'Control Center authentication' },
  { id: '11', label: 'Cross-project isolation' },
  { id: '12', label: 'Add product' },
  { id: '13', label: 'Customer checkout' },
  { id: '14', label: 'Order persistence' },
  { id: '15', label: 'Ask AI contextual order query' },
  { id: '16', label: 'Logout / session invalidation' },
  { id: '17', label: 'Failure recovery' },
  { id: '18', label: 'No internal terminology' },
  { id: '19', label: 'No agent intervention required' },
  { id: '20', label: 'No invented/mock production path' },
] as const

/** Terms a first-time operator must never need to understand. */
export const INTERNAL_OPERATOR_LEXICON =
  /\b(backend|database|schema|deployment|capability|PocketBase|Commerce ABI|guidedBackend|ensureDatabase|applySchema|CAS|payment_revision|wire_required|backend_required|Studio|tenant|provisioner|Coolify|Traefik|Docker|Postgres|persistCatalogProjection|is not defined)\b/i

/** Corrections a production builder must not require from the user. */
export const AGENT_INTERVENTION_ANTI_PATTERNS =
  /\b(mock cart|use the backend|actually deploy|don't invent|localStorage cart|call guidedBackend|open the gadget)\b/i

export type FtuMetric = 'completion' | 'cognitive_load' | 'agent_intervention' | 'recovery'

export type FtuStep = {
  id: string
  goal: string
  userAction: string
  expectState?: WorkspaceProjectState | WorkspaceProjectState[]
  metric: FtuMetric
}

export const FTU_ECOMMERCE_STEPS: readonly FtuStep[] = [
  { id: 'FTU-01', goal: 'I want to launch a sneaker store', userAction: 'home prompt / Store tile', expectState: 'empty', metric: 'completion' },
  { id: 'FTU-02', goal: 'Choose / infer Store', userAction: 'clear store intent — no SaaS vs shop quiz', expectState: 'empty', metric: 'cognitive_load' },
  { id: 'FTU-03', goal: 'Builder starts', userAction: 'platform starts launchProductionApp', expectState: 'building', metric: 'agent_intervention' },
  { id: 'FTU-04', goal: 'Preview appears', userAction: 'watch the right pane', expectState: ['building', 'preview_ready', 'production_ready'], metric: 'completion' },
  { id: 'FTU-05', goal: 'Make the hero more premium', userAction: 'chat: describe the change', expectState: ['preview_ready', 'production_ready', 'building'], metric: 'completion' },
  { id: 'FTU-06', goal: 'Click hero → edit', userAction: 'PREVIEW_EDIT on hero', expectState: ['preview_ready', 'production_ready', 'live'], metric: 'cognitive_load' },
  { id: 'FTU-07', goal: 'Change appears', userAction: 'preview reloads; agent says Done', expectState: ['preview_ready', 'production_ready', 'live'], metric: 'completion' },
  { id: 'FTU-08', goal: 'Launch it', userAction: 'Launch store chip / “Launch my store”', expectState: ['production_ready', 'publishing'], metric: 'agent_intervention' },
  { id: 'FTU-09', goal: 'Production job', userAction: 'job card in business language', expectState: ['building', 'publishing'], metric: 'cognitive_load' },
  { id: 'FTU-10', goal: 'LIVE', userAction: 'claim only when job status=live', expectState: 'live', metric: 'completion' },
  { id: 'FTU-11', goal: 'Control Center', userAction: 'workspace evolves; chat stays', expectState: 'live', metric: 'completion' },
  { id: 'FTU-12', goal: 'Add product', userAction: 'Products UI or SCREEN: products', expectState: 'live', metric: 'cognitive_load' },
  { id: 'FTU-13', goal: 'Customer purchases', userAction: 'guest checkout on live store', expectState: 'live', metric: 'completion' },
  { id: 'FTU-14', goal: 'Order appears', userAction: 'Control Center orders list', expectState: 'live', metric: 'completion' },
  { id: 'FTU-15', goal: 'Show me order #…', userAction: 'Ask AI on Orders', expectState: 'live', metric: 'cognitive_load' },
  { id: 'FTU-16', goal: 'AI understands current context', userAction: 'SCREEN entity is enough', expectState: 'live', metric: 'agent_intervention' },
]

export type FtuRecoveryCase = {
  id: string
  failure: string
  code: string
  repairable?: boolean
}

export const FTU_RECOVERY_CASES: readonly FtuRecoveryCase[] = [
  { id: 'FTU-R1', failure: 'payment unavailable', code: 'gateway_not_ready' },
  { id: 'FTU-R2', failure: 'generation / contract failure', code: 'contract_verifier_failed' },
  { id: 'FTU-R3', failure: 'invalid product / checkout flow', code: 'functional_verifier_failed' },
  { id: 'FTU-R4', failure: 'network / smoke interruption', code: 'smoke_failed' },
  { id: 'FTU-R5', failure: 'expired / guest session', code: 'account_required', repairable: false },
  { id: 'FTU-R6', failure: 'deployment failure', code: 'deploy_failed' },
  { id: 'FTU-R7', failure: 'customer accounts not connected', code: 'backend_required' },
]

export type FtuCheck = { id: string; ok: boolean; detail: string; metric: FtuMetric }

function operatorCopy(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join('\n')
}

export function certifyFtuLogic(): { version: typeof FTU_CERT_VERSION; certified: boolean; checks: FtuCheck[] } {
  const checks: FtuCheck[] = []
  const pass = (id: string, ok: boolean, detail: string, metric: FtuMetric) => {
    checks.push({ id, ok, detail, metric })
  }

  pass(
    'FTU-TOOLS',
    AGENT_FACING_TOOL_NAMES.length === 5 && AGENT_FACING_TOOL_NAMES[0] === 'launchProductionApp',
    'Agent surface stays five tools',
    'agent_intervention',
  )

  const store = HOME_INTENTS.find((t) => t.id === 'launch-store')
  const homeCopy = operatorCopy(UX_HOME_HEADLINE, store?.label, store?.prompt, store?.description)
  pass('FTU-01', Boolean(store) && /store/i.test(store?.prompt || ''), 'Home intent launches a store', 'completion')
  pass(
    'FTU-02',
    Boolean(store) && !INTERNAL_OPERATOR_LEXICON.test(homeCopy) && !/saas vs|shop or app/i.test(homeCopy),
    'Store is inferred in business language',
    'cognitive_load',
  )
  pass(
    'FTU-03',
    !AGENT_INTERVENTION_ANTI_PATTERNS.test(store?.prompt || ''),
    'User does not have to say use the backend / actually deploy',
    'agent_intervention',
  )

  pass('FTU-04', resolveWorkspaceState({ jobStatus: 'running' }) === 'building', 'Builder start → building', 'completion')
  pass(
    'FTU-04b',
    ['preview_ready', 'production_ready'].includes(
      resolveWorkspaceState({ previewUrl: '/live/x/', previewReady: true }),
    ),
    'Preview URL → preview_ready',
    'completion',
  )

  const edit = formatPreviewEditMessage({
    target: { type: 'section', id: 'hero', component: 'Hero', label: 'Hero' },
    intent: 'make_premium',
    request: 'Make the hero more premium.',
  })
  pass('FTU-05', /Make the hero more premium/.test(edit), 'Chat change is a request, not a tool', 'completion')
  pass('FTU-06', /^PREVIEW_EDIT/.test(edit) && /hero \(Hero\)/.test(edit), 'Click hero carries target', 'cognitive_load')
  pass('FTU-07', !INTERNAL_OPERATOR_LEXICON.test(edit), 'Edit message has no internal terms', 'cognitive_load')

  const launch = workspaceViewModel({
    backendReady: true,
    appType: 'ecommerce',
    previewUrl: '/live/x/',
    previewReady: true,
    stages: [
      { id: 'verify', status: 'ok' },
      { id: 'deploy', status: 'pending' },
    ],
  })
  pass('FTU-08', launch.state === 'production_ready' && launch.actions.some((a) => /Launch/i.test(a.label)), 'Launch is a business action', 'agent_intervention')
  pass(
    'FTU-09',
    launch.stages.some((s) => s.label === 'Testing your store') &&
      launch.stages.some((s) => s.label === 'Preparing launch'),
    'Job vocabulary is business language',
    'cognitive_load',
  )

  const live = workspaceViewModel({
    live: true,
    liveUrl: 'https://sneakers.sites.indobase.in',
    backendReady: true,
    paymentsReady: false,
    appType: 'ecommerce',
  })
  pass('FTU-10', live.state === 'live' && Boolean(live.liveUrl), 'LIVE only with live url', 'completion')
  pass('FTU-11', live.showControlCenter && live.nav.some((n) => n.id === 'overview'), 'Control Center after LIVE', 'completion')

  const add = formatScreenMessage({ section: 'products', label: 'Products' }, 'Add a new sneaker.')
  pass('FTU-12', /section: products/.test(add) && live.nav.some((n) => n.id === 'products'), 'Add product has a visual nav + SCREEN', 'cognitive_load')
  pass('FTU-13', live.capabilities.includes('commerce'), 'Customer purchase capability is on the project', 'completion')
  pass('FTU-14', live.nav.some((n) => n.id === 'orders'), 'Orders is a Control Center surface, not chat-only', 'completion')

  const show = formatScreenMessage({ section: 'orders', entityId: '1042', label: 'Orders' }, 'Show me this order.')
  pass('FTU-15', /entity: 1042/.test(show) && !INTERNAL_OPERATOR_LEXICON.test(show), 'Show order uses screen context', 'cognitive_load')
  pass('FTU-16', /section: orders/.test(show) && !/which order|order id please/i.test(show), 'AI is given the entity; user does not re-identify', 'agent_intervention')

  for (const rec of FTU_RECOVERY_CASES) {
    const human = humanizeLaunchFailure({ code: rec.code, repairable: rec.repairable })
    const blob = operatorCopy(human.title, human.body, ...human.actions.map((a) => a.label))
    pass(
      rec.id,
      !INTERNAL_OPERATOR_LEXICON.test(blob) && !new RegExp(rec.code, 'i').test(blob),
      `${rec.failure} → ${human.title}`,
      'recovery',
    )
  }

  const authority: AuthoritativeProject = {
    state: 'live',
    kind: 'store',
    capabilities: projectCapabilities({ appType: 'ecommerce', paymentsReady: true }),
    nav: controlCenterNav('store', projectCapabilities({ appType: 'ecommerce', paymentsReady: true })),
  }
  const projected = workspaceViewModel({
    appType: 'landing',
    authority,
  })
  pass(
    'LIVE-08',
    projected.state === 'live' && projected.nav.some((n) => n.id === 'products') && !projected.nav.some((n) => n.id === 'website'),
    'session.project authority wins over local UI guesses',
    'cognitive_load',
  )
  pass(
    'LIVE-09',
    live.nav.map((n) => n.id).join(',') ===
      'overview,products,orders,customers,storefront,payments,settings',
    'Control Center nav is contract-derived',
    'cognitive_load',
  )

  const anon = authorizeControlCenterAccess({ session: null, requestedProjectRef: 'roshb77a4744fa' })
  const owner = authorizeControlCenterAccess({
    session: { projectRef: 'roshb77a4744fa' },
    requestedProjectRef: 'roshb77a4744fa',
  })
  const cross = authorizeControlCenterAccess({
    session: { projectRef: 'roshb77a4744fa' },
    requestedProjectRef: 'v11xtenantb1',
  })
  const loggedOut = authorizeControlCenterAccess({ session: null })
  pass(
    'LIVE-10',
    !anon.ok && anon.status === 401 && owner.ok === true,
    'Control Center requires an OS session',
    'recovery',
  )
  pass('LIVE-11', !cross.ok && cross.status === 403, 'A cannot open B Control Center', 'recovery')
  pass('LIVE-16', !loggedOut.ok && loggedOut.status === 401, 'Logout / missing session is denied', 'recovery')
  pass(
    'LIVE-20',
    AGENT_FACING_TOOL_NAMES.includes('launchProductionApp') && !/mock cart/i.test(store?.prompt || ''),
    'Production path is launchProductionApp — not a mock cart',
    'agent_intervention',
  )

  return {
    version: FTU_CERT_VERSION,
    certified: checks.every((c) => c.ok),
    checks,
  }
}

export function ftuMetricScores(checks: FtuCheck[]): Record<FtuMetric, { pass: number; total: number }> {
  const scores = {
    completion: { pass: 0, total: 0 },
    cognitive_load: { pass: 0, total: 0 },
    agent_intervention: { pass: 0, total: 0 },
    recovery: { pass: 0, total: 0 },
  }
  for (const c of checks) {
    scores[c.metric].total += 1
    if (c.ok) scores[c.metric].pass += 1
  }
  return scores
}
