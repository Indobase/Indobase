/**
 * FTU execution contract — operator intent becomes commands + authoritative state.
 * begin-turn / auth-verify call this. The LLM does not get to skip it.
 *
 * Orchestration: classify → ExecutionPlan → validate → dispatch executor → verify → BusinessRuntimeState → reply
 * applyOperatorIntent is the only begin-turn public entry. LLM does not execute the plan.
 * Launch / Go Live → executeProductionLaunchJob (same path as launchProductionApp).
 */

import {
  createCommand,
  sanitizeAgentNarration,
  type BusinessRuntimeState,
} from '@indobase/platform'

import type { Session } from '../auth.js'
import { deriveAgentUsername } from '../agent-credentials.js'
import type { LaunchStatusSnapshot } from '../launch-journey.js'
import {
  getLatestProductionLaunchJob,
  type ProductionLaunchDeps,
  type ProductionLaunchExecuteResult,
  type ProductionLaunchJob,
} from '../production-launch/index.js'
import {
  getBusinessSpec,
  inferBusinessSpec,
  inferName,
  isPlaceholderBusinessName,
  pickBusinessName,
  rememberBusinessSpec,
  type BusinessSpec,
} from './business-spec.js'
import { composeRuntimeStateHint, toBusinessRuntimeState, type BusinessSnapshotSummary } from './agent-truth.js'
import { type probePreviewHttp, readLiveFile } from '../static-launch.js'
import { createLiveProbeHttp } from './runtime-probes.js'
import { classifyStoreCommand, looksLikeStoreCommand, type StoreCommandDeps, type StoreCommandResult } from './store-commands.js'
import {
  emptyPersistedRuntime,
  getWorkspaceRuntime,
  peekPendingIntent,
  rememberPendingIntentForSession,
  rememberWorkspaceRuntime,
  takePendingAcrossAuth,
  type PersistedWorkspaceRuntime,
} from './runtime-store.js'
import {
  authorizeExecutionPlan,
  buildExecutionPlan,
  validateExecutionPlan,
  type ExecutionPlan,
} from './execution-plan.js'
import { dispatchExecutionPlan, type ExecutorContext } from './executors/index.js'

export {
  PLAN_COMMAND,
  PLAN_STEP,
  buildExecutionPlan,
  deriveIdempotencyKey,
  planCommands,
  type ExecutionPlan,
} from './execution-plan.js'

export type OperatorIntentKind =
  | 'create_business'
  | 'launch_production'
  | 'preview_edit'
  | 'operate'
  | 'other'

/**
 * One owner per turn. Claims always come from BusinessRuntimeState.
 *   build   → conductor owns first generation
 *   modify  → command system owns subsequent mutations
 *   launch  → execution owns deploy
 *   operate → BusinessRuntimeState owns what the agent may claim
 */
export type ExecutionTurnClass = 'account' | 'build' | 'modify' | 'launch' | 'operate' | 'other'

export type ExecutionTurnResult = {
  ok: boolean
  intent: OperatorIntentKind
  turnClass: ExecutionTurnClass
  spec: BusinessSpec | null
  runtime: PersistedWorkspaceRuntime
  businessRuntime: BusinessRuntimeState
  launch?: ProductionLaunchExecuteResult | null
  recovered: boolean
  agentContext: string
  operatorMessage: string
  commandId?: string
  plan?: ExecutionPlan
}

export function turnClassForIntent(
  intent: OperatorIntentKind,
  input: { guest?: boolean; launched?: boolean } = {},
): ExecutionTurnClass {
  if (input.guest) return 'account'
  if (input.launched) return 'launch'
  switch (intent) {
    case 'create_business':
      return 'build'
    case 'preview_edit':
      return 'modify'
    case 'launch_production':
      return 'launch'
    case 'operate':
      return 'operate'
    default:
      return 'other'
  }
}

export type ApplyOperatorIntentInput = {
  session: Session
  message: string
  guest?: boolean
  snapshot?: BusinessSnapshotSummary | null
  launchStatus?: LaunchStatusSnapshot | null
  productionJob?: ProductionLaunchJob | null
  launchDeps?: ProductionLaunchDeps
  catalogDeps?: StoreCommandDeps
  probe?: typeof probePreviewHttp
  clientIdempotencyKey?: string
}

function stripRuntimeStamp(message: string): string {
  return (message || '')
    .replace(/<<<INDOBASE_RUNTIME>>>[\s\S]*?<<<END_INDOBASE_RUNTIME>>>\s*/gi, '')
    .replace(/<<<INDOBASE_RUNTIME>>>[\s\S]*$/gi, '')
    .replace(/<<<END_INDOBASE_RUNTIME>>>\s*/gi, '')
    .trim()
}

function looksLikeAuthNoise(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return true
  if (/^\d{4,8}$/.test(t)) return true
  if (/^(verify|otp|continue|ok|yes|done|thanks)$/i.test(t)) return true
  if (/\b(authVerify|authStart|verification code|one-time(?:\s+password)?)\b/i.test(t)) return true
  return false
}

function looksLikeCreateBusiness(text: string): boolean {
  const q = text.toLowerCase()
  if (looksLikeStoreCommand(text)) return false
  if (/\blaunch a\b/.test(q) || /\bbuild (?:me )?(?:a|an)\b/.test(q)) return true
  if (/\b(start building|create (?:me )?(?:a|an)|make (?:me )?(?:a|an) (?:store|shop|app|website|landing))\b/.test(q)) {
    return true
  }
  if (/\bcalled\s+[a-z]/i.test(text) && /\b(build|launch|create|make)\b/i.test(text)) return true
  return false
}

function looksLikeOperateQuestion(text: string): boolean {
  const q = text.toLowerCase()
  if (/\?/.test(text)) return true
  if (/\b(what can|how (?:do|can)|show me|tell me)\b/.test(q)) return true
  if (/\b(visitors?|customers?|orders?|this (?:website|site|app|store|business))\b/.test(q)) return true
  return false
}

function looksLikeGoLive(text: string): boolean {
  const q = text.toLowerCase()
  if (/\blaunch a\b/.test(q)) return false
  return (
    /\b(go live|take live|publish (?:this|it|my)|launch my (?:store|shop|site|website|landing|business|app)|launch store|launch this|launchproductionapp|\/api\/os\/apps\/launch)\b/.test(
      q,
    ) ||
    /\blaunch my store on indobase now\b/.test(q) ||
    /\bproduction:\s*true\b/.test(q)
  )
}

/** “Launch a premium sneaker store called X” — first turn is BUILD/preview, never LIVE. */
function looksLikeExplicitStoreLaunch(text: string): boolean {
  const q = text.toLowerCase()
  if (!/\blaunch a\b/.test(q)) return false
  return /\b(store|shop|sneaker|sneakers|ecommerce|boutique)\b/.test(q)
}

function previewIsReadyForLaunch(runtime: PersistedWorkspaceRuntime): boolean {
  return runtime.preview.status === 'ready'
}

export function classifyOperatorIntent(
  message: string,
  runtime: PersistedWorkspaceRuntime | null,
): OperatorIntentKind {
  const text = stripRuntimeStamp(message || '').trim()
  if (!text) return 'other'
  if (/^PREVIEW_EDIT\b/.test(text)) return 'preview_edit'
  if (/\b(hero headline|change the hero|headline to|make (?:the )?hero more premium)\b/i.test(text)) {
    return 'preview_edit'
  }
  if (/^SCREEN\b/.test(text)) return 'operate'
  if (looksLikeGoLive(text)) return 'launch_production'
  if (looksLikeStoreCommand(text)) return 'operate'
  if (runtime?.spec && looksLikeOperateQuestion(text) && !/\b(build|start building|create (?:me )?(?:a|an))\b/i.test(text)) {
    return 'operate'
  }
  if (looksLikeCreateBusiness(text)) return 'create_business'
  if (/\b(orders?|products?|customers?|inventory|sales|visitors?)\b/i.test(text)) return 'operate'
  return 'other'
}

function specFromProductionJob(job: ProductionLaunchJob): BusinessSpec {
  const inferred = inferBusinessSpec(
    job.intent || `Launch a ${job.vertical || 'store'} called ${job.title || job.brand || 'Store'}`,
  )
  const businessName =
    pickBusinessName(inferred.businessName, job.brand, job.title, inferName(job.intent || '')) ||
    inferred.businessName
  return {
    ...inferred,
    businessName,
    businessType:
      job.appType === 'saas' || job.appType === 'landing' || job.appType === 'ecommerce'
        ? job.appType
        : inferred.businessType,
    brand: pickBusinessName(job.brand, businessName, inferred.brand) || businessName,
    catalog: {
      ...inferred.catalog,
      verticalId: job.vertical || inferred.catalog.verticalId,
    },
    sourceIntent: job.intent || inferred.sourceIntent,
  }
}

/** Rebuild in-memory runtime from the durable job + launch status after a process restart. */
export async function rehydrateWorkspaceRuntime(
  session: Session,
  input: {
    launchStatus?: LaunchStatusSnapshot | null
    productionJob?: ProductionLaunchJob | null
  } = {},
): Promise<PersistedWorkspaceRuntime> {
  const existing = getWorkspaceRuntime(session.projectRef)
  let runtime = existing || emptyPersistedRuntime(session.projectRef)
  const job = input.productionJob || getLatestProductionLaunchJob(session.projectRef)
  const launch = input.launchStatus
  let dirty = !existing

  if (!runtime.spec) {
    const remembered = getBusinessSpec(session.projectRef)
    if (remembered) {
      runtime = { ...runtime, spec: remembered, plan: runtime.plan || planFromSpec(remembered) }
      dirty = true
    } else if (job) {
      const spec = rememberBusinessSpec(session.projectRef, specFromProductionJob(job))
      runtime = { ...runtime, spec, plan: planFromSpec(spec) }
      dirty = true
    }
  }

  let artifactHtml = runtime.artifactHtml || job?.html || job?.files?.['index.html'] || ''
  let artifactFiles = runtime.artifactFiles || job?.files
  if (!artifactHtml) {
    const disk = await readLiveFile(session.projectRef, 'index.html')
    const body = disk?.body?.toString('utf8') || ''
    if (body.includes('<html') || body.includes('<!DOCTYPE')) {
      artifactHtml = body
      artifactFiles = { ...(artifactFiles || {}), 'index.html': body }
    }
  }

  const existingEmbed =
    (runtime.preview.url && runtime.preview.url.includes('/live/') && runtime.preview.url) ||
    (launch?.previewUrl && launch.previewUrl.includes('/live/') && launch.previewUrl) ||
    null
  const previewUrl =
    existingEmbed ||
    (session.projectRef ? `/live/${session.projectRef}/` : launch?.previewUrl || null)
  const durablePreview =
    Boolean(launch?.previewReady) ||
    Boolean(job && (job.status === 'live' || job.html || job.files?.['index.html'])) ||
    Boolean(artifactHtml) ||
    Boolean(previewUrl)
  if (runtime.preview.status !== 'ready' && durablePreview) {
    const probed = runtime.preview.httpOk
    runtime = {
      ...runtime,
      preview: {
        status: probed === false ? 'failed' : 'ready',
        url: previewUrl,
        artifactRef: runtime.preview.artifactRef || job?.jobId || null,
        contentHash: runtime.preview.contentHash,
        httpOk: probed ?? null,
      },
      artifactHtml: artifactHtml || runtime.artifactHtml,
      artifactFiles: artifactFiles || runtime.artifactFiles,
    }
    dirty = true
  } else if (artifactHtml && !runtime.artifactHtml) {
    runtime = { ...runtime, artifactHtml, artifactFiles }
    dirty = true
  }

  if (dirty) return rememberWorkspaceRuntime(runtime)
  return runtime
}

function planFromSpec(spec: BusinessSpec): PersistedWorkspaceRuntime['plan'] {
  return {
    appType: spec.businessType,
    source: 'inferred',
    verticalId: spec.catalog.verticalId,
    positioning: spec.visualStyle,
  }
}

function toSessionRuntime(
  session: Session,
  persisted: PersistedWorkspaceRuntime,
  snapshot?: BusinessSnapshotSummary | null,
  launch?: ProductionLaunchExecuteResult | null,
): BusinessRuntimeState {
  const latestJob = launch?.job || getLatestProductionLaunchJob(session.projectRef)
  const liveUrl =
    (launch?.job.status === 'live' && launch.url) ||
    (latestJob?.status === 'live' && latestJob.url) ||
    null
  const liveHttpOk = latestJob?.evidence?.smoke_ok === true || launch?.job.evidence?.smoke_ok === true
  const previewReady =
    persisted.preview.status === 'ready' &&
    Boolean(persisted.preview.url) &&
    persisted.preview.httpOk !== false
  const projectState =
    liveUrl && liveHttpOk ? 'live' : previewReady ? 'preview_ready' : persisted.spec ? 'building' : 'empty'
  return toBusinessRuntimeState({
    projectState,
    previewStatus: persisted.preview.status,
    previewUrl: persisted.preview.url || (previewReady ? liveUrl : null),
    previewHttpOk: persisted.preview.httpOk ?? null,
    liveUrl: liveUrl && liveHttpOk ? liveUrl : null,
    liveHttpOk: liveUrl ? liveHttpOk : null,
    catalogReady:
      Boolean(snapshot?.products?.length) ||
      Boolean(launch?.job.evidence?.catalog_seeded) ||
      Boolean(latestJob?.evidence?.catalog_seeded),
    spec: persisted.spec || getBusinessSpec(session.projectRef),
    snapshot: snapshot || null,
    identity: {
      signedIn: Boolean(session.email),
      email: session.email || null,
      displayName: session.email || null,
    },
    business: {
      ref: session.projectRef,
      name: persisted.spec?.businessName || session.projectName || '',
      kind: persisted.spec?.businessType || 'unknown',
      state: projectState,
    },
    deployment: latestJob
      ? { status: latestJob.status, jobId: latestJob.jobId }
      : undefined,
    jobs: latestJob ? [{ id: latestJob.jobId, status: latestJob.status }] : [],
    workspace: { ref: session.projectRef, slug: session.orgSlug },
    capabilities: Object.entries(persisted.capabilities).map(([id, status]) => ({
      id,
      enabled: status === 'ready',
      status,
    })),
    events: persisted.events.map((e) => ({
      at: e.at,
      kind: e.kind,
      message: e.message,
      commandId: e.commandId,
    })),
  })
}

function operateReply(
  state: BusinessRuntimeState,
  named: string,
  store?: StoreCommandResult | null,
): string {
  if (store?.kind && store.message && (store.mutated || !store.ok || !store.readOnly)) {
    if (store.mutated) {
      const count = state.catalog?.productCount ?? state.products.length
      const tail = count ? ` Catalog now has ${count} product${count === 1 ? '' : 's'}.` : ''
      return `${store.message}${tail}`
    }
    if (store.message) return store.message
  }
  if (store?.mutated && store.message) {
    const count = state.catalog?.productCount ?? state.products.length
    const tail = count ? ` Catalog now has ${count} product${count === 1 ? '' : 's'}.` : ''
    return `${store.message}${tail}`
  }
  if (store?.kind === 'catalog.query' || store?.query === 'low-stock') {
    if (store.query === 'low-stock') {
      const lowNames = state.products
        .filter((p) => typeof p.stock === 'number' && p.stock > 0 && p.stock <= 5)
        .map((p) => p.name)
      if (lowNames.length) return `Low stock: ${lowNames.join(', ')}.`
      return 'No low-stock products.'
    }
    return store.message || `${state.catalog.productCount} products in the catalog.`
  }
  const kind = state.business.kind
  if ((kind === 'landing' || kind === 'website') && state.live.isLive) {
    const url = state.live.url
    if (named && url) return `${named} is live — ${url}`
    if (named) return `${named} is live.`
    return url ? `Your website is live — ${url}` : 'Your website is live.'
  }
  const count = state.orders.length
  if (!count) return named ? `${named} has no orders yet.` : 'No orders yet.'
  const latest = state.orders[0]
  const id = latest.orderNumber || latest.id
  const who = latest.customerName || latest.email
  const items = latest.itemsSummary
  const head = count === 1 ? '1 order' : `${count} orders`
  let out = `${head}. Latest: ${id}`
  if (who) out += ` from ${who}`
  if (items) out += ` — ${items}`
  return `${out}.`
}

function operatorMessageForTurn(input: {
  turnClass: ExecutionTurnClass
  intent: OperatorIntentKind
  named: string
  specName?: string
  previewStatus: PersistedWorkspaceRuntime['preview']['status']
  launch?: ProductionLaunchExecuteResult | null
  mutatedHeadline: string | null
  mutated: boolean
  businessRuntime: BusinessRuntimeState
  store?: StoreCommandResult | null
}): string {
  if (input.turnClass === 'launch') {
    const live =
      Boolean(input.launch?.ok && input.launch.claim_live && input.launch.url) &&
      input.businessRuntime.live.isLive
    const noun =
      input.businessRuntime.business.kind === 'saas' || input.businessRuntime.business.kind === 'app'
        ? 'app'
        : input.businessRuntime.business.kind === 'landing' ||
            input.businessRuntime.business.kind === 'website'
          ? 'website'
          : 'store'
    if (live && input.launch?.url) {
      const orders = input.businessRuntime.commerce.orderCount
      const orderBit =
        orders > 0 ? ` ${orders} order${orders === 1 ? '' : 's'} so far.` : ''
      return `Your ${noun} is live — ${input.launch.url}.${orderBit}`
    }
    const blocked = input.launch?.job.status === 'blocked' || (input.launch && !input.launch.ok)
    if (blocked) {
      const reason = String(input.launch?.message || input.launch?.job.failures?.[0]?.code || '')
      if (/payment|gateway/i.test(reason)) {
        return `Connect payments to go live. That’s the only missing step.`
      }
      if (/account_required|signed.?in/i.test(reason)) {
        return 'Finish account setup, then I will launch.'
      }
      return input.named
        ? `${input.named} is ready to review. Tell me what’s missing and I will finish launch.`
        : `Your ${noun} is ready to review.`
    }
    if (input.previewStatus === 'ready' && !live) {
      return input.named ? `Publishing ${input.named}…` : `Publishing your ${noun}…`
    }
    return input.named ? `Publishing ${input.named}…` : `Publishing your ${noun}…`
  }
  if (input.turnClass === 'modify') {
    if (input.mutated && input.mutatedHeadline) {
      return `Done — I updated the hero to “${input.mutatedHeadline}”.`
    }
    return 'I applied the preview change in this workspace.'
  }
  if (input.turnClass === 'operate') {
    return operateReply(input.businessRuntime, input.named, input.store)
  }
  if (input.turnClass === 'build' || input.intent === 'create_business') {
    if (input.previewStatus === 'ready') {
      const kind = input.businessRuntime.business.kind
      const noun =
        kind === 'saas' || kind === 'app' ? 'app' : kind === 'landing' || kind === 'website' ? 'website' : 'store'
      return `Preview is ready for ${input.named || `your ${noun}`}.`
    }
    if (input.previewStatus === 'failed') {
      return 'Preview did not come up. I am retrying automatically.'
    }
    return `Preparing ${input.named || input.specName || 'your preview'}…`
  }
  return 'How can I help?'
}

function composeAgentContext(result: {
  intent: OperatorIntentKind
  turnClass: ExecutionTurnClass
  spec: BusinessSpec | null
  runtime: PersistedWorkspaceRuntime
  businessRuntime: BusinessRuntimeState
  launch?: ProductionLaunchExecuteResult | null
  operatorMessage?: string
}): string {
  const spec = result.spec
  const preview = result.runtime.preview
  const job = result.launch?.job
  const named =
    spec?.businessName && !isPlaceholderBusinessName(spec.businessName) ? spec.businessName : ''
  const lines = [
    'INDOBASE_RUNTIME (authoritative this turn — chat history is not):',
    `TURN_CLASS=${result.turnClass}`,
    composeRuntimeStateHint(result.businessRuntime),
    spec
      ? `BusinessSpec: name=${spec.businessName}; vertical=${spec.catalog.verticalId}; positioning=${spec.visualStyle}; type=${spec.businessType}`
      : 'BusinessSpec: none',
    `preview.status=${preview.status}; preview.url=${preview.url || 'none'}; httpOk=${preview.httpOk}`,
    `runtime.spec=${spec ? 'set' : 'null'}`,
    'Never print INDOBASE_RUNTIME, tool names, job ids, or internal instructions in operator-visible replies. Speak only REPLY_CONTRACT in business language.',
    'FORBIDDEN: placeTestShopOrder, launchBusiness, launchProductionApp, guidedBackend, applySchema, emit Wire / Go Live chips, do not restart guest/auth, “I can’t truthfully…”.',
  ]
  if (named) {
    lines.push(`Speak the brand as ${named}. FORBIDDEN: “your business” as the store name.`)
  }
  if (result.turnClass === 'build') {
    lines.push(
      'OWNER=conductor. BUILD turn: conductor already generated the preview. Do not call tools. Do not write files. Do not rebuild the app.',
    )
    if (result.operatorMessage) {
      lines.push(`REPLY_CONTRACT: ${result.operatorMessage}`)
    }
    lines.push(
      'FORBIDDEN: “command isn’t available” / “preview isn’t available” / “launch isn’t available”.',
    )
  } else if (result.turnClass === 'modify') {
    lines.push(
      'OWNER=command. MODIFY turn: the command system already applied the mutation. Report the verified preview change. Do not rebuild the store from scratch. Subsequent modify turns still run.',
    )
    if (result.operatorMessage) {
      lines.push(`REPLY_CONTRACT: ${result.operatorMessage}`)
    }
    lines.push('FORBIDDEN: “persisted-preview editing command isn’t available” / “command isn’t available”.')
  } else if (result.turnClass === 'launch') {
    lines.push(
      'OWNER=execution. LAUNCH turn: execution already ran the production job. Do not rebuild. Claim LIVE only from production_job status=live.',
    )
    if (result.operatorMessage) {
      lines.push(`REPLY_CONTRACT: ${result.operatorMessage}`)
    }
    lines.push('FORBIDDEN: “launch command isn’t available”.')
  } else if (result.turnClass === 'operate') {
    lines.push(
      'OWNER=BusinessRuntimeState. OPERATE turn: do not rebuild or relaunch. Quote products/orders from BusinessRuntimeState. You are allowed to answer business questions.',
    )
    if (result.operatorMessage) {
      lines.push(`REPLY_CONTRACT: ${result.operatorMessage}`)
    }
  } else if (result.turnClass === 'account') {
    lines.push('OWNER=account. Finish account setup first. Do not build or launch yet.')
    if (result.operatorMessage) {
      lines.push(`REPLY_CONTRACT: ${result.operatorMessage}`)
    }
  } else if (result.operatorMessage) {
    lines.push(
      'OWNER=none. Answer from BusinessRuntimeState. Do not rebuild unless the operator asks to build, edit, or go live.',
    )
    lines.push(`REPLY_CONTRACT: ${result.operatorMessage}`)
  }
  if (job) {
    lines.push(`production_job=${job.jobId}; status=${job.status}; url=${job.url || 'none'}`)
  } else if (result.businessRuntime.deployment.jobId) {
    lines.push(
      `production_job=${result.businessRuntime.deployment.jobId}; status=${result.businessRuntime.deployment.status || 'unknown'}`,
    )
  } else {
    lines.push('production_job=null')
  }
  if (preview.status !== 'ready') {
    lines.push('FORBIDDEN: do not claim preview ready, store ready, or everything is ready.')
  }
  if (!result.runtime.capabilities.businessData || result.runtime.capabilities.businessData !== 'ready') {
    lines.push('FORBIDDEN: do not claim customer database enabled / ready.')
  }
  if (!job || job.status !== 'live' || !job.claim_live) {
    if (!result.businessRuntime.live.isLive) {
      lines.push('FORBIDDEN: do not claim LIVE or invent a live URL.')
    }
  }
  if (result.businessRuntime.orders.length > 0) {
    lines.push(
      'FORBIDDEN: do not say commerce admin / database / orders are unavailable. Quote BusinessRuntimeState.orders.',
    )
  }
  if (result.intent === 'create_business' && preview.status === 'ready') {
    lines.push('Say the preview is ready only if preview.status=ready. Offer Launch when they want it live.')
  }
  if (result.intent === 'launch_production' && job?.status === 'live' && job.url) {
    lines.push(`LIVE confirmed at ${job.url}. Operate from BusinessRuntimeState.`)
  }
  if (result.intent === 'preview_edit') {
    if (preview.status === 'ready' && preview.url) {
      lines.push(
        `PREVIEW_EDIT is allowed. preview.status=ready. The store IS this workspace (${spec?.businessName || result.businessRuntime.business.name || 'this business'} at ${preview.url}). The execution path already mutates the persisted artifact — do not call a preview-edit tool. FORBIDDEN: “not in this workspace” / “isn’t currently available” / “persisted-preview editing command isn’t available” / “launch command isn’t available”.`,
      )
    } else {
      lines.push(
        'PREVIEW_EDIT: apply the mutation through the existing execution path. FORBIDDEN: “persisted-preview editing command isn’t available”.',
      )
    }
  }
  if (result.intent === 'create_business' || result.intent === 'launch_production') {
    lines.push(
      'launchProductionApp is already on the session tool surface and the execution path invokes it. FORBIDDEN: “launch command isn’t available” / “preview command isn’t available”.',
    )
  }
  if (result.intent === 'operate' && result.businessRuntime.orders.length > 0) {
    lines.push('SCREEN / Ask AI: answer from BusinessRuntimeState.orders. Do not call a missing admin service.')
  }
  return lines.join('\n')
}

function executorContext(
  input: ApplyOperatorIntentInput,
  runtime: PersistedWorkspaceRuntime,
  message: string,
  specSource: string,
): ExecutorContext {
  return {
    session: input.session,
    message,
    specSource,
    probe: input.probe,
    launchDeps: {
      probes: createLiveProbeHttp(),
      ...(input.launchDeps || {}),
    },
    catalogDeps: input.catalogDeps,
    snapshot: input.snapshot,
    runtime,
  }
}

function gatedPlan(plan: ExecutionPlan, sessionProjectRef: string): ExecutionPlan | null {
  const auth = authorizeExecutionPlan(plan, sessionProjectRef)
  if (!auth.ok) return null
  const valid = validateExecutionPlan(plan)
  if (!valid.ok) return null
  return plan
}

export async function applyOperatorIntent(input: ApplyOperatorIntentInput): Promise<ExecutionTurnResult> {
  const { session, guest } = input
  const message = stripRuntimeStamp(input.message || '').trim()
  let runtime = await rehydrateWorkspaceRuntime(session, {
    launchStatus: input.launchStatus,
    productionJob: input.productionJob,
  })

  if (guest) {
    if (looksLikeCreateBusiness(message) || looksLikeGoLive(message)) {
      rememberPendingIntentForSession(session, message)
    }
    const businessRuntime = toSessionRuntime(session, runtime, input.snapshot)
    const operatorMessage = 'Finish account setup first. I already have your request.'
    return {
      ok: true,
      intent: 'other',
      turnClass: 'account',
      spec: runtime.spec,
      runtime,
      businessRuntime,
      recovered: false,
      agentContext: composeAgentContext({
        intent: 'other',
        turnClass: 'account',
        spec: runtime.spec,
        runtime,
        businessRuntime,
        operatorMessage,
      }),
      operatorMessage,
    }
  }

  const agentPendingKey =
    session.gotrueId && session.projectRef
      ? `agent:${deriveAgentUsername(session.gotrueId, session.projectRef)}`
      : ''
  const pending =
    peekPendingIntent(session.projectRef) ||
    peekPendingIntent(session.cfosBindProjectRef) ||
    peekPendingIntent(agentPendingKey)
  const effectiveMessage =
    (!message || looksLikeAuthNoise(message)) && pending ? pending : message || pending || ''
  const specSource =
    pending && looksLikeCreateBusiness(pending)
      ? pending
      : [pending, message || effectiveMessage].filter(Boolean).join('\n') || effectiveMessage
  const intent = classifyOperatorIntent(effectiveMessage, runtime)
  const classifiedStore = classifyStoreCommand(effectiveMessage || message)

  let launch: ProductionLaunchExecuteResult | null = null
  let recovered = false
  let commandId: string | undefined
  let spec = runtime.spec || getBusinessSpec(session.projectRef)
  let mutatedHeadline: string | null = null
  let store: StoreCommandResult | null = null
  let snapshot = input.snapshot
  let plan: ExecutionPlan | undefined

  const ctxBase = () => executorContext(input, runtime, effectiveMessage || message, specSource)

  if (
    !spec &&
    specSource &&
    (intent === 'other' || intent === 'operate') &&
    (inferName(specSource) || looksLikeCreateBusiness(specSource))
  ) {
    const inferPlan = gatedPlan(
      buildExecutionPlan({
        projectRef: session.projectRef,
        intent: 'create_business',
        turnClass: 'build',
        businessType: spec?.businessType,
        message: specSource,
      }),
      session.projectRef,
    )
    if (inferPlan) {
      const created = await dispatchExecutionPlan(inferPlan, ctxBase())
      spec = created.spec || spec
      runtime = created.runtime
      recovered = created.recovered
      commandId = created.commandId
      plan = inferPlan
    }
  }

  const creatingStore =
    intent !== 'launch_production' &&
    (looksLikeExplicitStoreLaunch(effectiveMessage) || intent === 'create_business')
  const primaryTurn =
    creatingStore
      ? 'build'
      : intent === 'launch_production' && previewIsReadyForLaunch(runtime)
        ? 'launch'
        : intent === 'launch_production'
          ? 'build'
          : turnClassForIntent(intent)
  const includeBuild = false
  plan = gatedPlan(
    buildExecutionPlan({
      projectRef: session.projectRef,
      intent: primaryTurn === 'launch' ? 'launch_production' : intent === 'launch_production' ? 'create_business' : intent,
      turnClass: primaryTurn,
      businessType: spec?.businessType || runtime.spec?.businessType,
      store: classifiedStore,
      message: effectiveMessage || message,
      includeBuild,
      clientIdempotencyKey: input.clientIdempotencyKey,
    }),
    session.projectRef,
  ) || plan

  if (plan && (plan.turnClass === 'build' || plan.turnClass === 'modify' || plan.turnClass === 'operate' || plan.turnClass === 'launch')) {
    const executed = await dispatchExecutionPlan(plan, ctxBase())
    runtime = executed.runtime
    if (executed.spec) spec = executed.spec
    recovered = recovered || executed.recovered
    if (executed.commandId) commandId = executed.commandId
    if (executed.launch) launch = executed.launch
    if (executed.mutatedHeadline !== undefined) mutatedHeadline = executed.mutatedHeadline
    if (executed.store) store = executed.store
    if (executed.snapshot) snapshot = executed.snapshot
    plan = executed.plan || plan
  }

  runtime = getWorkspaceRuntime(session.projectRef) || runtime
  spec = runtime.spec || spec
  const businessRuntime = toSessionRuntime(session, runtime, snapshot, launch)
  const named =
    spec?.businessName && !isPlaceholderBusinessName(spec.businessName)
      ? spec.businessName
      : ''
  const turnClass = plan?.turnClass || turnClassForIntent(intent, { launched: Boolean(launch) })
  const operatorMessage = verifyNarration(
    operatorMessageForTurn({
      turnClass,
      intent,
      named,
      specName: spec?.businessName,
      previewStatus: runtime.preview.status,
      launch,
      mutatedHeadline,
      mutated: recovered && Boolean(mutatedHeadline),
      businessRuntime,
      store,
    }),
    businessRuntime,
  )
  let agentContext = composeAgentContext({
    intent,
    turnClass,
    spec,
    runtime,
    businessRuntime,
    launch,
    operatorMessage,
  })
  if (mutatedHeadline && recovered) {
    agentContext += `\nMUTATION_APPLIED: hero headline is now “${mutatedHeadline}”. Persisted to the preview artifact. Do not say the store is missing.`
  }
  if (store?.mutated) {
    agentContext += `\nMUTATION_APPLIED: ${store.message} Speak only from BusinessRuntimeState.products / catalog. Never name PocketBase or tell the operator to open Products.`
  }

  if (pending && spec && !isPlaceholderBusinessName(spec.businessName)) {
    takePendingAcrossAuth([
      session.projectRef,
      session.cfosBindProjectRef ? `bind:${session.cfosBindProjectRef}` : null,
      agentPendingKey,
    ])
  }

  return {
    ok: intent === 'launch_production' ? Boolean(launch?.ok) : runtime.preview.status !== 'failed',
    intent,
    turnClass,
    spec,
    runtime,
    businessRuntime,
    launch,
    recovered,
    agentContext,
    operatorMessage,
    commandId,
    plan,
  }
}

export function applyPendingIntentAfterAuth(
  session: Session,
  deps?: Pick<ApplyOperatorIntentInput, 'launchDeps' | 'probe' | 'snapshot' | 'launchStatus' | 'productionJob'>,
): Promise<ExecutionTurnResult | null> {
  const pending = peekPendingIntent(session.projectRef)
  if (!pending) return Promise.resolve(null)
  return applyOperatorIntent({
    session,
    message: pending,
    guest: false,
    snapshot: deps?.snapshot,
    launchStatus: deps?.launchStatus,
    productionJob: deps?.productionJob,
    launchDeps: deps?.launchDeps,
    probe: deps?.probe,
  })
}

export function verifyNarration(text: string, state: BusinessRuntimeState): string {
  const cleaned = sanitizeAgentNarration(text, state)
  if (
    /truthfully|launchBusiness|placeTestShopOrder|do not restart guest|Wire \/ Go Live|Call for Go Live/i.test(
      `${text}\n${cleaned}`,
    )
  ) {
    const name = (state.business.name || '').trim()
    const noun =
      state.business.kind === 'saas' || state.business.kind === 'app'
        ? 'app'
        : state.business.kind === 'landing' || state.business.kind === 'website'
          ? 'website'
          : 'store'
    if (state.live.isLive && state.live.url) {
      return name ? `${name} is live — ${state.live.url}` : `Your ${noun} is live — ${state.live.url}`
    }
    if (state.preview.status === 'ready' && state.preview.url) {
      return `Your ${noun} is ready to review.`
    }
    return `Preparing your ${noun}…`
  }
  return cleaned
}

/** Used by tests — prove launchProductionApp path was entered via the command. */
export function launchCommandForIntent(projectRef: string, spec: BusinessSpec) {
  return createCommand(
    'runtime.launch',
    {
      projectRef,
      appType: spec.businessType,
      vertical: spec.catalog.verticalId,
      tool: 'launchProductionApp',
    },
    { projectRef },
  )
}
