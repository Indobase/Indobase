/**
 * Deterministic production launch pipeline.
 * The agent does not choose whether these stages exist.
 */

import { createHash } from 'node:crypto'

import type { BackendConfig, Session } from '../auth.js'
import { executeGuidedBackend } from '../guided-backend-chain.js'
import { executeLaunchBusinessTool } from '../launch-business-tool.js'
import { assertLaunchArchitectureReady } from '../launch-backend-gate.js'
import { readLiveFile } from '../static-launch.js'
import { autoWireLaunchArtifacts } from '../wire-proof.js'
import { assertEcommerceReleaseGateAsync } from '../delivery/index.js'
import { humanizeLaunchFailure } from '../ux-conductor.js'
import { getWorkspaceRuntime } from '../ux/runtime-store.js'
import {
  getBusinessSpec,
  inferBusinessSpec,
  inferName,
  isPlaceholderBusinessName,
  pickBusinessName,
  rememberBusinessSpec,
} from '../ux/business-spec.js'
import {
  ensureEcommerceStorefrontFiles,
  ensureSaasAppFiles,
  saasAppHasRuntimeAbi,
  storefrontHasCommerceAbi,
} from '../ux/preview-artifact.js'
import { planProductionApp } from './application-planner.js'
import { resolveProductionContract } from './production-contract.js'
import { buildProductionLandingHtml, buildProductionSaasHtml } from './shells.js'
import {
  MAX_REPAIR_ATTEMPTS,
  buildEmptyStages,
  createProductionJobId,
  getProductionLaunchJob,
  patchStage,
  rememberProductionLaunchJob,
  type ProductionLaunchFailure,
  type ProductionLaunchJob,
  type ProductionLaunchStageId,
} from './job-store.js'
import {
  emptyProductionEvidence,
  evidenceFromVerifiers,
  finalizeEvidence,
  mergeEvidence,
} from './evidence.js'

export type ProductionLaunchInput = {
  jobId?: string | null
  intent?: string | null
  appType?: string | null
  production?: boolean | null
  html?: string | null
  files?: Record<string, string> | null
  title?: string | null
  brand?: string | null
  vertical?: string | null
  subdomain?: string | null
}

export type ProductionLaunchDeps = {
  launch?: typeof executeLaunchBusinessTool
  guided?: typeof executeGuidedBackend
  smoke?: (url: string, appType: ProductionLaunchJob['appType']) => Promise<{ ok: boolean; message: string }>
}

export type ProductionLaunchExecuteResult = {
  ok: boolean
  job: ProductionLaunchJob
  message: string
  url?: string
  claim_live: boolean
  code?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function backendFromGuided(result: {
  backend?: {
    api_url?: string
    anon_key?: string
    auth_url?: string
    rest_url?: string
    storage_url?: string
    project_ref?: string
    project_name?: string
  }
}): BackendConfig | null {
  const b = result.backend
  if (!b?.api_url?.trim() || !b.anon_key?.trim()) return null
  return {
    api_url: b.api_url,
    anon_key: b.anon_key,
    auth_url: b.auth_url || `${b.api_url.replace(/\/+$/, '')}/api`,
    rest_url: b.rest_url || `${b.api_url.replace(/\/+$/, '')}/api/collections`,
    storage_url: b.storage_url || `${b.api_url.replace(/\/+$/, '')}/api/files`,
    project_ref: b.project_ref || '',
    project_name: b.project_name || '',
    project_url: b.api_url,
  }
}

function failStage(
  job: ProductionLaunchJob,
  stage: ProductionLaunchStageId,
  failure: ProductionLaunchFailure,
): ProductionLaunchJob {
  const repairAttempts = job.repairAttempts + (failure.repairable ? 1 : 0)
  return rememberProductionLaunchJob({
    ...patchStage(job, stage, {
      status: 'failed',
      message: failure.message,
      finishedAt: nowIso(),
    }),
    status: 'blocked',
    repairAttempts,
    failures: [...job.failures, failure],
    claim_live: false,
  })
}

async function smokeLiveUrl(url: string, appType: ProductionLaunchJob['appType']): Promise<{
  ok: boolean
  message: string
}> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12_000) })
    if (!res.ok) {
      return { ok: false, message: `Smoke failed: live URL returned HTTP ${res.status}` }
    }
    const html = await res.text()
    if (appType === 'landing') {
      return { ok: true, message: 'Landing smoke passed (HTTP 200)' }
    }
    if (appType === 'ecommerce') {
      const wired = /indobase\.commerce|\/api\/os\/commerce/i.test(html)
      return wired
        ? { ok: true, message: 'Store smoke passed (commerce ABI present)' }
        : { ok: false, message: 'Smoke failed: live store is not bound to commerce APIs' }
    }
    const wired = /__INDOBASE_ENV__|\/api\/collections\/|auth-with-otp/i.test(html)
    return wired
      ? { ok: true, message: 'SaaS smoke passed (auth + records markers)' }
      : { ok: false, message: 'Smoke failed: live app is not bound to Indobase auth/data' }
  } catch (err) {
    return { ok: false, message: `Smoke failed: ${err instanceof Error ? err.message : 'unreachable'}` }
  }
}

function hashArtifactHtml(html: string): string {
  return createHash('sha256').update(html).digest('hex')
}

async function freezeWorkspaceArtifact(
  session: Session,
  job: ProductionLaunchJob,
): Promise<ProductionLaunchJob> {
  const runtime = getWorkspaceRuntime(session.projectRef)
  let html = (job.html || runtime?.artifactHtml || runtime?.artifactFiles?.['index.html'] || '').trim()
  if (!html) {
    const disk = await readLiveFile(session.projectRef, 'index.html')
    html = disk?.body.toString('utf8') || ''
  }
  if (!html) return job
  const files = job.files || runtime?.artifactFiles || { 'index.html': html }
  const placeholderHero = /<h1>\s*your business\s*<\/h1>/i.test(html)
  const freezeable =
    (storefrontHasCommerceAbi(html) || saasAppHasRuntimeAbi(html)) &&
    /<h1[\s>]/i.test(html) &&
    !placeholderHero
  if (!freezeable) {
    return rememberProductionLaunchJob({
      ...job,
      html,
      files: { ...files, 'index.html': html },
      frozenArtifactHash: undefined,
    })
  }
  return rememberProductionLaunchJob({
    ...job,
    html,
    files: { ...files, 'index.html': html },
    frozenArtifactHash: hashArtifactHtml(html),
  })
}

function newJob(session: Session, input: ProductionLaunchInput): ProductionLaunchJob {
  const plan = planProductionApp({ appType: input.appType, intent: input.intent })
  const contract = resolveProductionContract(plan.appType)
  let inferred
  try {
    inferred = inferBusinessSpec(input.intent || '')
  } catch {
    inferred = inferBusinessSpec((input.intent || '').replace(/\bcall(?:ed)?\s+it\b/gi, 'called'))
  }
  const named = pickBusinessName(
    inferred.businessName,
    input.brand,
    input.title,
    inferName(input.intent || ''),
  )
  const spec = rememberBusinessSpec(session.projectRef, {
    ...inferred,
    businessName: named || inferred.businessName,
    brand: named || inferred.brand,
  })
  const vertical = input.vertical?.trim() || (plan.appType === 'ecommerce' ? spec.catalog.verticalId : undefined)
  const brand =
    pickBusinessName(input.brand, spec.businessName, inferred.businessName) ||
    (spec.businessName && !isPlaceholderBusinessName(spec.businessName) ? spec.businessName : undefined)
  return rememberProductionLaunchJob({
    version: 'production-launch-job/v1',
    jobId: createProductionJobId(),
    projectRef: session.projectRef,
    gotrueId: session.gotrueId,
    email: session.email,
    intent: (input.intent || input.title || '').trim(),
    production: true,
    appType: plan.appType,
    plan,
    contract,
    status: 'queued',
    stages: buildEmptyStages(plan.appType),
    html: typeof input.html === 'string' ? input.html : undefined,
    files: input.files || undefined,
    title: pickBusinessName(input.title, brand, spec.businessName) || brand,
    brand,
    vertical,
    backend: session.backend ?? null,
    claim_live: false,
    evidence: emptyProductionEvidence(),
    repairAttempts: 0,
    failures: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })
}

export async function executeProductionLaunchJob(
  session: Session,
  input: ProductionLaunchInput,
  deps: ProductionLaunchDeps = {},
): Promise<ProductionLaunchExecuteResult> {
  const launchFn = deps.launch || executeLaunchBusinessTool
  const guidedFn = deps.guided || executeGuidedBackend
  const smokeFn = deps.smoke || smokeLiveUrl
  let job =
    (input.jobId ? getProductionLaunchJob(input.jobId) : null) ||
    newJob(session, input)

  if (input.html) job = rememberProductionLaunchJob({ ...job, html: input.html })
  if (input.files) job = rememberProductionLaunchJob({ ...job, files: input.files })
  if (input.brand) job = rememberProductionLaunchJob({ ...job, brand: input.brand })
  if (input.vertical) job = rememberProductionLaunchJob({ ...job, vertical: input.vertical })
  if (input.title) job = rememberProductionLaunchJob({ ...job, title: input.title })
  job = await freezeWorkspaceArtifact(session, job)

  if (job.status === 'blocked' && job.repairAttempts >= MAX_REPAIR_ATTEMPTS) {
    const last = job.failures.at(-1)
    const human = humanizeLaunchFailure({
      code: last?.code || 'launch_blocked',
      message: last?.message,
      repairable: false,
    })
    return {
      ok: false,
      job,
      message: `${human.title} ${human.body} I couldn't safely resolve this automatically.`,
      claim_live: false,
      code: last?.code || 'launch_blocked',
    }
  }

  job = rememberProductionLaunchJob({
    ...job,
    status: 'running',
    stages: job.status === 'blocked' ? buildEmptyStages(job.appType) : job.stages,
  })

  // 1. Classify (already done at create; re-assert)
  job = patchStage(job, 'classify', {
    status: 'ok',
    message: `${job.appType} (${job.plan.source})`,
    startedAt: nowIso(),
    finishedAt: nowIso(),
  })

  // 2. Contract
  job = patchStage(job, 'contract', {
    status: 'ok',
    message: job.contract.version,
    startedAt: nowIso(),
    finishedAt: nowIso(),
  })

  // 3. Provision
  job = patchStage(job, 'provision', { status: 'running', startedAt: nowIso() })
  if (!job.plan.backendRequired) {
    job = rememberProductionLaunchJob({
      ...patchStage(job, 'provision', {
        status: 'skipped',
        message: 'Landing — no tenant backend',
        finishedAt: nowIso(),
      }),
      evidence: mergeEvidence(job.evidence, {
        backend_ready: true,
        catalog_seeded: true,
        test_order_ok: true,
        storefront_bound: true,
      }),
    })
  } else {
    const guided = await guidedFn(session, {
      mode: job.appType === 'ecommerce' ? 'ecommerce' : 'generic',
      vertical: job.vertical,
      brand: job.brand || job.title,
      place_test_order: job.appType === 'ecommerce',
      message: job.intent,
    })
    const backend = backendFromGuided(guided) || session.backend || null
    if (!guided.ok || !backend) {
      job = failStage(job, 'provision', {
        code: guided.code || 'backend_required',
        severity: 'critical',
        stage: 'provision',
        message: guided.message || 'Could not provision Indobase auth + database',
        repairable: true,
        repair_hint: 'Retry launch. Provisioner must return api_url + anon_key.',
      })
      return blocked(job)
    }
    const testOrderOk = (guided.steps || []).some(
      (s) => s.id === 'placeTestShopOrder' && s.status === 'ok',
    )
    job = rememberProductionLaunchJob({
      ...patchStage(job, 'provision', {
        status: 'ok',
        message: guided.progress || 'Backend ready',
        finishedAt: nowIso(),
      }),
      backend,
      html: job.frozenArtifactHash ? job.html : job.html || guided.storefront_html,
      evidence: mergeEvidence(job.evidence, {
        backend_ready: true,
        catalog_seeded: job.appType !== 'ecommerce' || Boolean(guided.catalog_json) || testOrderOk,
        storefront_bound: Boolean(job.html || guided.storefront_html),
        test_order_ok: job.appType !== 'ecommerce' || testOrderOk,
      }),
    })
  }

  if (job.frozenArtifactHash) {
    job = await freezeWorkspaceArtifact(session, { ...job, html: job.html })
  }

  // 4. Generate
  job = patchStage(job, 'generate', { status: 'running', startedAt: nowIso() })
  const spec = getBusinessSpec(session.projectRef) || inferBusinessSpec(job.intent || job.title || '')
  if (job.frozenArtifactHash && job.html?.trim()) {
    job = rememberProductionLaunchJob({
      ...job,
      html: job.html,
      files: { ...(job.files || {}), 'index.html': job.html },
    })
  } else if (job.appType === 'ecommerce' || spec.businessType === 'ecommerce') {
    const built = ensureEcommerceStorefrontFiles({
      spec: { ...spec, businessType: 'ecommerce' },
      projectRef: session.projectRef,
      html: job.html,
      files: job.files,
    })
    job = rememberProductionLaunchJob({
      ...job,
      html: built.html,
      files: built.files,
      appType: 'ecommerce',
    })
  } else if (job.appType === 'saas' || spec.businessType === 'saas') {
    const built = ensureSaasAppFiles({
      spec: { ...spec, businessType: 'saas' },
      projectRef: session.projectRef,
      html: job.html,
      files: job.files,
      backend: job.backend,
    })
    job = rememberProductionLaunchJob({
      ...job,
      html: built.html,
      files: built.files,
      appType: 'saas',
    })
  } else if (!job.html?.trim() && !(job.files && Object.keys(job.files).length)) {
    if (job.appType === 'landing') {
      job = rememberProductionLaunchJob({
        ...job,
        html: buildProductionLandingHtml({ brand: job.brand || job.title, intent: job.intent }),
      })
    } else if (job.appType === 'saas' && job.backend) {
      job = rememberProductionLaunchJob({
        ...job,
        html: buildProductionSaasHtml({ brand: job.brand || job.title, backend: job.backend }),
      })
    } else {
      job = rememberProductionLaunchJob({
        ...patchStage(job, 'generate', {
          status: 'failed',
          message: 'Production UI required',
          finishedAt: nowIso(),
        }),
        status: 'awaiting_generate',
        claim_live: false,
      })
      return {
        ok: false,
        job,
        message:
          'Job is waiting for production HTML. POST /api/os/apps/launch with jobId + html (or files) bound to the contract — do not call ensure* yourself.',
        claim_live: false,
        code: 'awaiting_generate',
      }
    }
  }
  job = patchStage(job, 'generate', {
    status: 'ok',
    message: 'Production UI ready',
    finishedAt: nowIso(),
  })

  // 5. Wire
  job = patchStage(job, 'wire', { status: 'running', startedAt: nowIso() })
  if (job.backend) {
    const keepFrozen =
      Boolean(job.frozenArtifactHash) &&
      (storefrontHasCommerceAbi(job.html) || saasAppHasRuntimeAbi(job.html))
    if (!keepFrozen) {
      const wired = autoWireLaunchArtifacts({
        html: job.html,
        files: job.files,
        backend: job.backend,
        brand: job.brand || job.title,
        replaceUnwiredStorefront: job.appType === 'ecommerce' && !job.frozenArtifactHash,
      })
      job = rememberProductionLaunchJob({
        ...job,
        html: wired.html || job.html,
        files: wired.files || job.files,
      })
    }
  }
  job = patchStage(job, 'wire', {
    status: 'ok',
    message: job.backend ? 'Runtime bindings applied' : 'No backend to bind',
    finishedAt: nowIso(),
  })

  // 6. Verify
  job = patchStage(job, 'verify', { status: 'running', startedAt: nowIso() })
  if (!job.frozenArtifactHash) {
    const arch = await assertLaunchArchitectureReady(job.backend, {
      app_type: job.appType,
      require_backend: job.plan.backendRequired,
      projectRef: job.projectRef,
      html: job.html,
      files: job.files,
    })
    if (!arch.ok) {
      job = failStage(job, 'verify', {
        code: arch.code,
        severity: 'critical',
        stage: 'verify',
        message: arch.message,
        repairable: true,
        repair_hint: arch.message,
      })
      return blocked(job)
    }
    if (job.appType === 'ecommerce') {
      const gate = await assertEcommerceReleaseGateAsync({
        projectRef: job.projectRef,
        app_type: 'ecommerce',
        html: job.html,
        files: job.files,
      })
      if (!gate.ok) {
        job = failStage(job, 'verify', {
          code: gate.code,
          severity: 'critical',
          stage: 'verify',
          message: gate.message,
          repairable: true,
          repair_hint: gate.repair_hints?.[0] || gate.message,
        })
        return blocked(job)
      }
      job = rememberProductionLaunchJob({
        ...job,
        evidence: mergeEvidence(job.evidence, {
          storefront_bound: true,
          ...evidenceFromVerifiers(gate.results),
          test_order_ok: job.evidence?.test_order_ok === true,
        }),
      })
    }
  }
  job = patchStage(job, 'verify', {
    status: 'ok',
    message: 'Application contract satisfied',
    finishedAt: nowIso(),
  })

  // 7. Deploy
  job = patchStage(job, 'deploy', { status: 'running', startedAt: nowIso() })
  if (job.frozenArtifactHash) {
    const published = hashArtifactHtml(job.html || '')
    job = rememberProductionLaunchJob({ ...job, publishedArtifactHash: published })
    if (published !== job.frozenArtifactHash) {
      job = failStage(job, 'deploy', {
        code: 'artifact_mismatch',
        severity: 'critical',
        stage: 'deploy',
        message: 'Production HTML does not match the frozen preview artifact.',
        repairable: true,
        repair_hint: 'Launch the current workspace preview instead of regenerating the storefront.',
      })
      return blocked(job)
    }
  }
  const launched = await launchFn(
    job.projectRef,
    {
      title: job.title || job.brand || session.projectName || job.projectRef,
      subdomain: input.subdomain,
      html: job.html,
      files: job.files,
      app_type: job.appType,
      require_backend: job.plan.backendRequired,
      gotrueId: session.gotrueId,
      email: session.email,
    },
    { title: session.projectName || job.projectRef, backend: job.backend },
  )
  if (!launched.ok || !launched.claim_live || !launched.url) {
    job = failStage(job, 'deploy', {
      code: launched.code || 'deploy_failed',
      severity: 'critical',
      stage: 'deploy',
      message: launched.message || 'Deploy did not return a live URL',
      repairable: true,
      repair_hint: launched.repair_hints?.[0] || launched.message,
    })
    return blocked(job)
  }
  job = rememberProductionLaunchJob({
    ...patchStage(job, 'deploy', {
      status: 'ok',
      message: launched.url,
      finishedAt: nowIso(),
    }),
    url: launched.url,
  })

  // 8. Smoke
  job = patchStage(job, 'smoke', { status: 'running', startedAt: nowIso() })
  const smoke = await smokeFn(job.url!, job.appType)
  if (!smoke.ok) {
    job = failStage(job, 'smoke', {
      code: 'smoke_failed',
      severity: 'critical',
      stage: 'smoke',
      message: smoke.message,
      repairable: true,
      repair_hint: 'Fix the live page against the contract, then retry POST /api/os/apps/launch with the same jobId.',
    })
    return blocked(job)
  }
  job = patchStage(job, 'smoke', {
    status: 'ok',
    message: smoke.message,
    finishedAt: nowIso(),
  })

  // 9. LIVE
  const liveJob: ProductionLaunchJob = {
    ...patchStage(job, 'live', {
      status: 'ok',
      message: 'LIVE',
      startedAt: nowIso(),
      finishedAt: nowIso(),
    }),
    status: 'live',
    claim_live: true,
    evidence: mergeEvidence(job.evidence, { smoke_ok: true }),
  }
  liveJob.evidence = finalizeEvidence(liveJob)
  job = rememberProductionLaunchJob(liveJob)

  return {
    ok: true,
    job,
    message: `LIVE — ${job.url}`,
    url: job.url,
    claim_live: true,
  }
}

function blocked(job: ProductionLaunchJob): ProductionLaunchExecuteResult {
  const last = job.failures[job.failures.length - 1]
  const retriesLeft = Math.max(0, MAX_REPAIR_ATTEMPTS - job.repairAttempts)
  const human = humanizeLaunchFailure({
    code: last?.code,
    message: last?.message,
    repairable: last?.repairable !== false && retriesLeft > 0,
  })
  const next =
    retriesLeft && human.repairable
      ? ' I will retry automatically if you ask me to fix it.'
      : retriesLeft
        ? ' You can try again or keep editing.'
        : ''
  return {
    ok: false,
    job,
    message: `${human.title} ${human.body}${next}`,
    claim_live: false,
    code: last?.code || job.status,
  }
}

export function summarizeProductionLaunchJob(job: ProductionLaunchJob) {
  const counts = { pending: 0, running: 0, ok: 0, skipped: 0, failed: 0, total: job.stages.length }
  for (const s of job.stages) counts[s.status] += 1
  const last = job.failures[job.failures.length - 1]
  return {
    jobId: job.jobId,
    status: job.status,
    appType: job.appType,
    claim_live: job.claim_live,
    url: job.url || null,
    repairAttempts: job.repairAttempts,
    counts,
    next_pending: job.stages.find((s) => s.status === 'pending' || s.status === 'running')?.id,
    failures: job.failures,
    operator_failure:
      job.status === 'blocked' && last
        ? humanizeLaunchFailure({
            code: last.code,
            message: last.message,
            repairable: last.repairable,
          })
        : null,
  }
}
