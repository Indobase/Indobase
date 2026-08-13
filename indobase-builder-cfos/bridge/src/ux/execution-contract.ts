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
import {
  executeProductionLaunchJob,
  type ProductionLaunchDeps,
  type ProductionLaunchExecuteResult,
} from '../production-launch/index.js'
import {
  getBusinessSpec,
  inferBusinessSpec,
  rememberBusinessSpec,
  type BusinessSpec,
} from './business-spec.js'
import { toBusinessRuntimeState, type BusinessSnapshotSummary } from './agent-truth.js'
import { materializePreview } from './preview-artifact.js'
import { probePreviewHttp } from '../static-launch.js'
import {
  appendRuntimeEvent,
  emptyPersistedRuntime,
  getWorkspaceRuntime,
  issueRuntimeCommand,
  patchWorkspaceRuntime,
  peekPendingIntent,
  rememberPendingIntent,
  rememberWorkspaceRuntime,
  takePendingIntent,
  type PersistedWorkspaceRuntime,
} from './runtime-store.js'

export type OperatorIntentKind =
  | 'create_business'
  | 'launch_production'
  | 'preview_edit'
  | 'operate'
  | 'other'

export type ExecutionTurnResult = {
  ok: boolean
  intent: OperatorIntentKind
  spec: BusinessSpec | null
  runtime: PersistedWorkspaceRuntime
  businessRuntime: BusinessRuntimeState
  launch?: ProductionLaunchExecuteResult | null
  recovered: boolean
  agentContext: string
  operatorMessage: string
  commandId?: string
}

export type ApplyOperatorIntentInput = {
  session: Session
  message: string
  guest?: boolean
  snapshot?: BusinessSnapshotSummary | null
  launchDeps?: ProductionLaunchDeps
  probe?: typeof probePreviewHttp
}

function looksLikeCreateBusiness(text: string): boolean {
  const q = text.toLowerCase()
  if (/\blaunch a\b/.test(q) || /\bbuild (?:me )?(?:a|an)\b/.test(q)) return true
  if (/\bcalled\s+[a-z]/i.test(text)) return true
  return /\b(store|shop|sneaker|ecommerce|landing|website|saas)\b/.test(q)
}

function looksLikeGoLive(text: string): boolean {
  const q = text.toLowerCase()
  if (/\blaunch a\b/.test(q)) return false
  return (
    /\b(go live|take live|publish (?:this|it|my)|launch my (?:store|shop|site|business|app)|launch store|launch this|launchproductionapp|\/api\/os\/apps\/launch)\b/.test(
      q,
    ) || /\bproduction:\s*true\b/.test(q)
  )
}

export function classifyOperatorIntent(
  message: string,
  runtime: PersistedWorkspaceRuntime | null,
): OperatorIntentKind {
  const text = (message || '').trim()
  if (!text) return 'other'
  if (/^PREVIEW_EDIT\b/.test(text)) return 'preview_edit'
  if (/^SCREEN\b/.test(text)) return 'operate'
  if (looksLikeGoLive(text)) return 'launch_production'
  if (looksLikeCreateBusiness(text)) return 'create_business'
  if (runtime?.spec && /\b(order|product|customer|inventory|sales)\b/i.test(text)) return 'operate'
  return 'other'
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
  const liveUrl = launch?.job.status === 'live' && launch.url ? launch.url : null
  const previewReady = persisted.preview.status === 'ready' && Boolean(persisted.preview.url)
  const projectState = liveUrl ? 'live' : previewReady ? 'preview_ready' : persisted.spec ? 'building' : 'empty'
  return toBusinessRuntimeState({
    projectState,
    previewStatus: persisted.preview.status,
    previewUrl: persisted.preview.url || liveUrl,
    liveUrl,
    catalogReady: Boolean(snapshot?.products?.length) || Boolean(launch?.job.evidence?.catalog_seeded),
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
    deployment: launch?.job
      ? { status: launch.job.status, jobId: launch.job.jobId }
      : undefined,
    jobs: launch?.job ? [{ id: launch.job.jobId, status: launch.job.status }] : [],
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

function composeAgentContext(result: {
  intent: OperatorIntentKind
  spec: BusinessSpec | null
  runtime: PersistedWorkspaceRuntime
  launch?: ProductionLaunchExecuteResult | null
}): string {
  const spec = result.spec
  const preview = result.runtime.preview
  const job = result.launch?.job
  const lines = [
    'INDOBASE_RUNTIME (authoritative this turn — chat history is not):',
    spec
      ? `BusinessSpec: name=${spec.businessName}; vertical=${spec.catalog.verticalId}; positioning=${spec.visualStyle}; type=${spec.businessType}`
      : 'BusinessSpec: none',
    `preview.status=${preview.status}; preview.url=${preview.url || 'none'}; httpOk=${preview.httpOk}`,
    `runtime.spec=${spec ? 'set' : 'null'}`,
  ]
  if (job) {
    lines.push(`production_job=${job.jobId}; status=${job.status}; url=${job.url || 'none'}`)
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
    lines.push('FORBIDDEN: do not claim LIVE or invent a live URL.')
  }
  if (result.intent === 'create_business' && preview.status === 'ready') {
    lines.push('Say the preview is ready only if preview.status=ready. Offer Launch when they want it live.')
  }
  if (result.intent === 'launch_production' && job?.status === 'live' && job.url) {
    lines.push(`LIVE confirmed at ${job.url}. Operate from BusinessRuntimeState.`)
  }
  return lines.join('\n')
}

async function ensureSpecAndPreview(
  session: Session,
  message: string,
  probe?: typeof probePreviewHttp,
): Promise<{ spec: BusinessSpec; runtime: PersistedWorkspaceRuntime; recovered: boolean; commandId: string }> {
  const spec = rememberBusinessSpec(session.projectRef, inferBusinessSpec(message))
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
  const spec = runtime.spec || getBusinessSpec(session.projectRef) || inferBusinessSpec(message)
  rememberBusinessSpec(session.projectRef, spec)
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
      title: spec.businessName,
      brand: spec.businessName,
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

export async function applyOperatorIntent(input: ApplyOperatorIntentInput): Promise<ExecutionTurnResult> {
  const { session, guest } = input
  const message = (input.message || '').trim()
  let runtime = getWorkspaceRuntime(session.projectRef) || emptyPersistedRuntime(session.projectRef)
  if (!getWorkspaceRuntime(session.projectRef)) {
    rememberWorkspaceRuntime(runtime)
  }

  if (guest) {
    if (looksLikeCreateBusiness(message) || looksLikeGoLive(message)) {
      rememberPendingIntent(session.projectRef, message)
    }
    const businessRuntime = toSessionRuntime(session, runtime, input.snapshot)
    return {
      ok: true,
      intent: 'other',
      spec: runtime.spec,
      runtime,
      businessRuntime,
      recovered: false,
      agentContext: composeAgentContext({ intent: 'other', spec: runtime.spec, runtime }),
      operatorMessage: 'Finish account setup first. I already have your request.',
    }
  }

  const pending = peekPendingIntent(session.projectRef)
  const effectiveMessage = message || pending || ''
  const intent = classifyOperatorIntent(effectiveMessage, runtime)
  if (pending && (intent === 'create_business' || intent === 'launch_production' || !message)) {
    takePendingIntent(session.projectRef)
  }

  let launch: ProductionLaunchExecuteResult | null = null
  let recovered = false
  let commandId: string | undefined
  let spec = runtime.spec || getBusinessSpec(session.projectRef)

  if (intent === 'create_business' || (intent === 'launch_production' && !runtime.spec && effectiveMessage)) {
    const created = await ensureSpecAndPreview(session, effectiveMessage, input.probe)
    spec = created.spec
    runtime = created.runtime
    recovered = created.recovered
    commandId = created.commandId
  }

  if (intent === 'launch_production' && (runtime.spec || spec)) {
    if (runtime.preview.status !== 'ready' || !runtime.artifactHtml) {
      const created = await ensureSpecAndPreview(
        session,
        effectiveMessage || spec?.sourceIntent || message,
        input.probe,
      )
      spec = created.spec
      runtime = created.runtime
      recovered = recovered || created.recovered
    }
    const launched = await runProductionLaunch(session, effectiveMessage || message, runtime, input.launchDeps)
    launch = launched.launch
    runtime = launched.runtime
    commandId = launched.commandId
  }

  runtime = getWorkspaceRuntime(session.projectRef) || runtime
  spec = runtime.spec || spec
  const businessRuntime = toSessionRuntime(session, runtime, input.snapshot, launch)
  const agentContext = composeAgentContext({ intent, spec, runtime, launch })
  const operatorMessage =
    intent === 'launch_production' && launch?.ok && launch.url
      ? `Your store is live — ${launch.url}`
      : runtime.preview.status === 'ready'
        ? `Preview is ready for ${spec?.businessName || 'your business'}.`
        : runtime.preview.status === 'failed'
          ? 'Preview did not come up. I am retrying automatically.'
          : spec
            ? `Preparing ${spec.businessName}…`
            : 'How can I help?'

  return {
    ok: intent === 'launch_production' ? Boolean(launch?.ok) : runtime.preview.status !== 'failed',
    intent,
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
  deps?: Pick<ApplyOperatorIntentInput, 'launchDeps' | 'probe' | 'snapshot'>,
): Promise<ExecutionTurnResult | null> {
  const pending = peekPendingIntent(session.projectRef)
  if (!pending) return Promise.resolve(null)
  return applyOperatorIntent({
    session,
    message: pending,
    guest: false,
    snapshot: deps?.snapshot,
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
