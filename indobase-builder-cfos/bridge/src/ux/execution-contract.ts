/**
 * FTU execution contract — operator intent becomes commands + authoritative state.
 * begin-turn / auth-verify call this. The LLM does not get to skip it.
 *
 * Intent → BusinessSpec → RuntimePlan → RuntimeCommand → Runtime → artifact → preview
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
  executeProductionLaunchJob,
  getLatestProductionLaunchJob,
  rememberProductionLaunchJob,
  type ProductionLaunchDeps,
  type ProductionLaunchExecuteResult,
  type ProductionLaunchJob,
} from '../production-launch/index.js'
import {
  getBusinessSpec,
  inferBusinessSpec,
  inferName,
  isPlaceholderBusinessName,
  mergeBusinessSpec,
  pickBusinessName,
  rememberBusinessSpec,
  type BusinessSpec,
} from './business-spec.js'
import { composeRuntimeStateHint, toBusinessRuntimeState, type BusinessSnapshotSummary } from './agent-truth.js'
import {
  extractRequestedHeadline,
  injectStorefrontProductSnapshot,
  materializePreview,
  mutateHeroHeadline,
  storefrontHasCommerceAbi,
} from './preview-artifact.js'
import { probePreviewHttp, readLiveFile, writeDraftPreview } from '../static-launch.js'
import { executeLaunchBusinessTool } from '../launch-business-tool.js'
import {
  classifyStoreCommand,
  executeStoreCommand,
  looksLikeStoreCommand,
  type StoreCommandDeps,
  type StoreCommandResult,
} from './store-commands.js'
import {
  appendRuntimeEvent,
  emptyPersistedRuntime,
  getWorkspaceRuntime,
  issueRuntimeCommand,
  patchWorkspaceRuntime,
  peekPendingIntent,
  rememberPendingIntentForSession,
  rememberWorkspaceRuntime,
  takePendingAcrossAuth,
  type PersistedWorkspaceRuntime,
} from './runtime-store.js'

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
    ) || /\bproduction:\s*true\b/.test(q)
  )
}

/** “Launch a premium sneaker store called X” — preview then the existing launchProductionApp path. */
function looksLikeExplicitStoreLaunch(text: string): boolean {
  const q = text.toLowerCase()
  if (!/\blaunch a\b/.test(q)) return false
  return /\b(store|shop|sneaker|sneakers|ecommerce|boutique)\b/.test(q)
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
    runtime = {
      ...runtime,
      preview: {
        status: 'ready',
        url: previewUrl,
        artifactRef: runtime.preview.artifactRef || job?.jobId || null,
        contentHash: runtime.preview.contentHash,
        httpOk: Boolean(job?.url || launch?.url || launch?.previewReady || artifactHtml),
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
  const previewReady = persisted.preview.status === 'ready' && Boolean(persisted.preview.url)
  const projectState = liveUrl ? 'live' : previewReady ? 'preview_ready' : persisted.spec ? 'building' : 'empty'
  return toBusinessRuntimeState({
    projectState,
    previewStatus: persisted.preview.status,
    previewUrl: persisted.preview.url || liveUrl,
    liveUrl,
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
      return `Your ${noun} is live — ${input.launch.url}`
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
    'Never print INDOBASE_RUNTIME, Studio, PocketBase, provisioner, or guidedBackend in operator-visible replies.',
    'FORBIDDEN: do not name internal setup steps. If preview.status=ready, report that — do not say an operation is unavailable.',
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

async function ensureSpecAndPreview(
  session: Session,
  message: string,
  probe?: typeof probePreviewHttp,
): Promise<{ spec: BusinessSpec; runtime: PersistedWorkspaceRuntime; recovered: boolean; commandId: string }> {
  const inferred = inferBusinessSpec(message)
  const spec = rememberBusinessSpec(
    session.projectRef,
    mergeBusinessSpec(getBusinessSpec(session.projectRef), {
      ...inferred,
      businessName: pickBusinessName(inferred.businessName, inferName(message)) || inferred.businessName,
      sourceIntent: inferred.sourceIntent || message,
    }),
  )
  const existing = getWorkspaceRuntime(session.projectRef)
  if (
    existing?.spec &&
    !isPlaceholderBusinessName(existing.spec.businessName) &&
    existing.preview.status === 'ready' &&
    existing.artifactHtml
  ) {
    const runtime = patchWorkspaceRuntime(session.projectRef, {
      spec,
      plan: planFromSpec(spec),
    })
    return {
      spec,
      runtime: getWorkspaceRuntime(session.projectRef) || runtime,
      recovered: false,
      commandId: existing.lastCommandId || '',
    }
  }
  const createCmd = issueRuntimeCommand(session.projectRef, 'runtime.create', {
    spec: {
      name: spec.businessName,
      vertical: spec.catalog.verticalId,
      positioning: spec.visualStyle,
    },
  })
  let runtime = patchWorkspaceRuntime(session.projectRef, {
    spec,
    plan: planFromSpec(spec),
    lastCommandId: createCmd.id,
  })
  appendRuntimeEvent(session.projectRef, {
    kind: 'runtime.spec',
    message: `${spec.businessName} / ${spec.catalog.verticalId} / ${spec.visualStyle}`,
    commandId: createCmd.id,
  })

  const previewCmd = issueRuntimeCommand(session.projectRef, 'runtime.preview', {
    businessName: spec.businessName,
  })
  runtime = patchWorkspaceRuntime(session.projectRef, {
    preview: { ...runtime.preview, status: 'building' },
    lastCommandId: previewCmd.id,
  })

  let built = await materializePreview({ projectRef: session.projectRef, spec, probe })
  let recovered = false
  if (!built.ok) {
    built = await materializePreview({ projectRef: session.projectRef, spec, probe })
    recovered = built.ok
    appendRuntimeEvent(session.projectRef, {
      kind: 'runtime.repair',
      message: recovered ? 'Preview rebuilt after first failure' : built.message,
      commandId: previewCmd.id,
    })
  }

  runtime = patchWorkspaceRuntime(session.projectRef, {
    spec,
    plan: planFromSpec(spec),
    preview: {
      status: built.status,
      url: built.url,
      artifactRef: built.artifactRef,
      contentHash: built.contentHash,
      httpOk: built.httpOk,
    },
    artifactHtml: built.html,
    artifactFiles: built.files,
    lastCommandId: previewCmd.id,
  })
  appendRuntimeEvent(session.projectRef, {
    kind: built.ok ? 'runtime.preview.ready' : 'runtime.preview.failed',
    message: built.message,
    commandId: previewCmd.id,
  })
  return { spec, runtime: getWorkspaceRuntime(session.projectRef) || runtime, recovered, commandId: previewCmd.id }
}

async function runProductionLaunch(
  session: Session,
  message: string,
  runtime: PersistedWorkspaceRuntime,
  launchDeps?: ProductionLaunchDeps,
): Promise<{ launch: ProductionLaunchExecuteResult; runtime: PersistedWorkspaceRuntime; commandId: string }> {
  const inferred = inferBusinessSpec(message)
  const spec = rememberBusinessSpec(
    session.projectRef,
    mergeBusinessSpec(runtime.spec || getBusinessSpec(session.projectRef), {
      businessName:
        pickBusinessName(
          runtime.spec?.businessName,
          getBusinessSpec(session.projectRef)?.businessName,
          inferred.businessName,
          inferName(message),
        ) || inferred.businessName,
      sourceIntent: runtime.spec?.sourceIntent || inferred.sourceIntent || message,
    }),
  )
  const command = issueRuntimeCommand(session.projectRef, 'runtime.launch', {
    appType: spec.businessType,
    vertical: spec.catalog.verticalId,
  })
  const launch = await executeProductionLaunchJob(
    session,
    {
      intent: spec.sourceIntent || message,
      appType: spec.businessType,
      production: true,
      html: runtime.artifactHtml || runtime.artifactFiles?.['index.html'] || null,
      files: runtime.artifactFiles || null,
      title: isPlaceholderBusinessName(spec.businessName) ? undefined : spec.businessName,
      brand: isPlaceholderBusinessName(spec.businessName) ? undefined : spec.businessName,
      vertical: spec.catalog.verticalId,
    },
    launchDeps,
  )
  appendRuntimeEvent(session.projectRef, {
    kind: launch.ok ? 'runtime.launch.live' : 'runtime.launch.failed',
    message: launch.message,
    commandId: command.id,
  })
  if (!launch.ok && launch.job.status === 'blocked' && launch.job.repairAttempts < 3) {
    const retry = await executeProductionLaunchJob(
      session,
      {
        jobId: launch.job.jobId,
        intent: spec.sourceIntent || message,
        appType: spec.businessType,
        production: true,
        html: runtime.artifactHtml || null,
        files: runtime.artifactFiles || null,
        title: spec.businessName,
        brand: spec.businessName,
        vertical: spec.catalog.verticalId,
      },
      launchDeps,
    )
    appendRuntimeEvent(session.projectRef, {
      kind: retry.ok ? 'runtime.launch.retry.live' : 'runtime.launch.retry.failed',
      message: retry.message,
      commandId: command.id,
    })
    return {
      launch: retry,
      runtime: getWorkspaceRuntime(session.projectRef) || runtime,
      commandId: command.id,
    }
  }
  return {
    launch,
    runtime: getWorkspaceRuntime(session.projectRef) || runtime,
    commandId: command.id,
  }
}

function subdomainFromLiveUrl(url: string | null | undefined): string | undefined {
  const raw = (url || '').trim()
  if (!raw) return undefined
  try {
    const host = new URL(raw).hostname.toLowerCase()
    const label = host.split('.')[0]
    return label && label !== 'www' ? label : undefined
  } catch {
    return undefined
  }
}

async function applyPersistedPreviewEdit(
  session: Session,
  message: string,
  runtime: PersistedWorkspaceRuntime,
  launchDeps?: ProductionLaunchDeps,
): Promise<{ runtime: PersistedWorkspaceRuntime; commandId?: string; mutated: boolean; headline: string | null }> {
  const headline = extractRequestedHeadline(message)
  if (!headline) return { runtime, mutated: false, headline: null }

  let html = runtime.artifactHtml || runtime.artifactFiles?.['index.html'] || ''
  if (!html) {
    const disk = await readLiveFile(session.projectRef, 'index.html')
    html = disk?.body?.toString('utf8') || ''
  }
  const job = getLatestProductionLaunchJob(session.projectRef)
  if (!html) html = job?.html || job?.files?.['index.html'] || ''
  if (!html) return { runtime, mutated: false, headline }

  const nextHtml = mutateHeroHeadline(html, headline)
  if (!nextHtml || nextHtml === html) return { runtime, mutated: false, headline }

  const files = { ...(runtime.artifactFiles || {}), 'index.html': nextHtml }
  const written = await writeDraftPreview({
    workspaceRef: session.projectRef,
    title: runtime.spec?.businessName || session.projectName || 'Preview',
    files,
  })
  const command = issueRuntimeCommand(session.projectRef, 'runtime.preview', {
    mutation: 'hero_headline',
    headline,
  })
  runtime = patchWorkspaceRuntime(session.projectRef, {
    preview: {
      ...runtime.preview,
      status: 'ready',
      url: runtime.preview.url || written.previewUrl,
      artifactRef: written.artifactRef,
      contentHash: written.contentHash,
      httpOk: true,
    },
    artifactHtml: nextHtml,
    artifactFiles: files,
    lastCommandId: command.id,
  })
  appendRuntimeEvent(session.projectRef, {
    kind: 'runtime.preview.mutate',
    message: `Hero headline → ${headline}`,
    commandId: command.id,
  })
  if (job) {
    rememberProductionLaunchJob({
      ...job,
      html: nextHtml,
      files: { ...(job.files || {}), 'index.html': nextHtml },
    })
    if ((job.status === 'live' || job.url) && !launchDeps?.launch) {
      try {
        await executeLaunchBusinessTool(
          session.projectRef,
          {
            title: runtime.spec?.businessName || job.title || job.brand,
            subdomain: subdomainFromLiveUrl(job.url) || job.brand || undefined,
            html: nextHtml,
            files,
            app_type: job.appType,
            gotrueId: session.gotrueId,
            email: session.email,
          },
          { title: runtime.spec?.businessName || job.title, backend: session.backend },
        )
      } catch {
        /* draft + job html already persisted; live republish retries on next launch */
      }
    }
  }
  return { runtime: getWorkspaceRuntime(session.projectRef) || runtime, commandId: command.id, mutated: true, headline }
}

const STOREFRONT_VISIBLE_KINDS = new Set(['product.create', 'product.update', 'inventory.update'])

async function persistCatalogProjection(
  session: Session,
  runtime: PersistedWorkspaceRuntime,
  snapshot: BusinessSnapshotSummary,
  launchDeps?: ProductionLaunchDeps,
): Promise<PersistedWorkspaceRuntime> {
  let html = runtime.artifactHtml || runtime.artifactFiles?.['index.html'] || ''
  if (!html) {
    const disk = await readLiveFile(session.projectRef, 'index.html')
    html = disk?.body?.toString('utf8') || ''
  }
  const job = getLatestProductionLaunchJob(session.projectRef)
  if (!html) html = job?.html || job?.files?.['index.html'] || ''
  if (!html || !storefrontHasCommerceAbi(html)) return runtime

  const nextHtml = injectStorefrontProductSnapshot(html, snapshot.products || [])
  if (!nextHtml || nextHtml === html) return runtime

  const files = { ...(runtime.artifactFiles || {}), 'index.html': nextHtml }
  const written = await writeDraftPreview({
    workspaceRef: session.projectRef,
    title: runtime.spec?.businessName || session.projectName || 'Preview',
    files,
  })
  const command = issueRuntimeCommand(session.projectRef, 'runtime.preview', {
    mutation: 'catalog_projection',
    productCount: snapshot.products?.length || 0,
  })
  runtime = patchWorkspaceRuntime(session.projectRef, {
    preview: {
      ...runtime.preview,
      status: 'ready',
      url: runtime.preview.url || written.previewUrl,
      artifactRef: written.artifactRef,
      contentHash: written.contentHash,
      httpOk: true,
    },
    artifactHtml: nextHtml,
    artifactFiles: files,
    lastCommandId: command.id,
  })
  appendRuntimeEvent(session.projectRef, {
    kind: 'runtime.catalog.project',
    message: `Storefront catalog projection (${snapshot.products?.length || 0} products)`,
    commandId: command.id,
  })
  if (job) {
    rememberProductionLaunchJob({
      ...job,
      html: nextHtml,
      files: { ...(job.files || {}), 'index.html': nextHtml },
    })
    if ((job.status === 'live' || job.url) && !launchDeps?.launch) {
      try {
        await executeLaunchBusinessTool(
          session.projectRef,
          {
            title: runtime.spec?.businessName || job.title || job.brand,
            subdomain: subdomainFromLiveUrl(job.url) || job.brand || undefined,
            html: nextHtml,
            files,
            app_type: job.appType,
            gotrueId: session.gotrueId,
            email: session.email,
          },
          { title: runtime.spec?.businessName || job.title, backend: session.backend },
        )
      } catch {
        /* draft + job html already persisted; live republish retries on next launch */
      }
    }
  }
  return getWorkspaceRuntime(session.projectRef) || runtime
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

  let launch: ProductionLaunchExecuteResult | null = null
  let recovered = false
  let commandId: string | undefined
  let spec = runtime.spec || getBusinessSpec(session.projectRef)

  if (
    !spec &&
    specSource &&
    (intent === 'other' || intent === 'operate') &&
    (inferName(specSource) || looksLikeCreateBusiness(specSource))
  ) {
    const created = await ensureSpecAndPreview(session, specSource, input.probe)
    spec = created.spec
    runtime = created.runtime
    recovered = created.recovered
    commandId = created.commandId
  }

  if (
    intent === 'create_business' ||
    (intent === 'launch_production' && (!runtime.spec || isPlaceholderBusinessName(runtime.spec.businessName)) && specSource)
  ) {
    const created = await ensureSpecAndPreview(session, specSource, input.probe)
    spec = created.spec
    runtime = created.runtime
    recovered = created.recovered
    commandId = created.commandId
  }

  const shouldLaunchNow =
    intent === 'launch_production' ||
    (intent === 'create_business' && looksLikeExplicitStoreLaunch(effectiveMessage) && Boolean(runtime.spec || spec))

  if (shouldLaunchNow && (runtime.spec || spec)) {
    if (runtime.preview.status !== 'ready' || !runtime.artifactHtml) {
      const created = await ensureSpecAndPreview(
        session,
        specSource || spec?.sourceIntent || message,
        input.probe,
      )
      spec = created.spec
      runtime = created.runtime
      recovered = recovered || created.recovered
    }
    const launched = await runProductionLaunch(session, specSource || message, runtime, input.launchDeps)
    launch = launched.launch
    runtime = launched.runtime
    commandId = launched.commandId
  }

  let mutatedHeadline: string | null = null
  if (intent === 'preview_edit') {
    const edited = await applyPersistedPreviewEdit(
      session,
      effectiveMessage || message,
      runtime,
      input.launchDeps,
    )
    runtime = edited.runtime
    mutatedHeadline = edited.headline
    if (edited.commandId) commandId = edited.commandId
    recovered = recovered || edited.mutated
  }

  let store: StoreCommandResult | null = null
  let snapshot = input.snapshot
  const classifiedStore = classifyStoreCommand(effectiveMessage || message)
  if (intent === 'operate' && classifiedStore && (!classifiedStore.readOnly || input.catalogDeps)) {
    store = await executeStoreCommand({
      session,
      guest: false,
      requestedProjectRef: session.projectRef,
      message: effectiveMessage || message,
      deps: input.catalogDeps,
    })
    if (store.command) {
      commandId = store.command.id
    }
    if (store.ok && store.snapshot && (store.mutated || input.catalogDeps)) {
      snapshot = store.snapshot
    }
    recovered = recovered || store.mutated
    if (store.mutated) {
      appendRuntimeEvent(session.projectRef, {
        kind: store.kind || 'product.create',
        message: store.message,
        commandId: store.command?.id,
      })
      if (store.ok && store.kind && STOREFRONT_VISIBLE_KINDS.has(store.kind) && store.snapshot) {
        runtime = await persistCatalogProjection(session, runtime, store.snapshot, input.launchDeps)
      }
    }
  }

  runtime = getWorkspaceRuntime(session.projectRef) || runtime
  spec = runtime.spec || spec
  const businessRuntime = toSessionRuntime(session, runtime, snapshot, launch)
  const named =
    spec?.businessName && !isPlaceholderBusinessName(spec.businessName)
      ? spec.businessName
      : ''
  const turnClass = turnClassForIntent(intent, { launched: Boolean(launch) })
  const operatorMessage = operatorMessageForTurn({
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
  })
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
  return sanitizeAgentNarration(text, state)
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
