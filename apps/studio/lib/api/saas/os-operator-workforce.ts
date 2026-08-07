/**
 * AI Operator workforce slice — Indobase OS Operate loop.
 *
 * Runs a small in-process job plan via `@indobase/agent-runtime`
 * (beginRun → plan → executeStep → finishRun). Not a background worker fleet:
 * jobs execute synchronously on operator start (and any future re-run hook).
 *
 * Jobs today:
 * - uptime_check — probe liveUrl
 * - seo_basics — title / meta / robots / sitemap findings
 * - error_signals — extension point for Sentry/analytics (no-op until wired)
 *
 * Deferred: email answering, campaigns, inventory, invoicing.
 */

import {
  createAgentRuntime,
  createAgentStepId,
  type AgentExecutor,
  type AgentPlanner,
  type AgentStep,
} from '@indobase/agent-runtime'
import { Platform } from '@indobase/platform'

export type OsOperatorSuggestion = {
  id: string
  title: string
  /** Customer-safe one-liner. */
  message: string
}

export const OPERATOR_JOB_UPTIME = 'operator.uptime_check' as const
export const OPERATOR_JOB_SEO = 'operator.seo_basics' as const
export const OPERATOR_JOB_ERROR_SIGNALS = 'operator.error_signals' as const

export const OPERATOR_WORKFORCE_JOB_KINDS = [
  OPERATOR_JOB_UPTIME,
  OPERATOR_JOB_SEO,
  OPERATOR_JOB_ERROR_SIGNALS,
] as const

export type OperatorWorkforceJobKind = (typeof OPERATOR_WORKFORCE_JOB_KINDS)[number]

export type OsOperatorJobStatus = 'succeeded' | 'failed' | 'skipped'

export type OsOperatorJobResult = {
  id: string
  kind: OperatorWorkforceJobKind | string
  status: OsOperatorJobStatus
  ran_at: string
  /** Customer-safe one-liner. */
  summary: string
  findings?: Record<string, unknown>
  suggestions?: OsOperatorSuggestion[]
}

export type OperatorWorkforceRunResult = {
  runId: string
  lastRunAt: string
  jobs: OsOperatorJobResult[]
  suggestions: OsOperatorSuggestion[]
}

export type OperatorErrorSignalProvider = (input: {
  workspaceRef: string
  liveUrl: string
}) => Promise<{
  status?: OsOperatorJobStatus
  summary?: string
  findings?: Record<string, unknown>
  suggestions?: OsOperatorSuggestion[]
} | null>

export type OperatorWorkforceOptions = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Future Sentry / analytics hook. Default: structured no-op. */
  errorSignalProvider?: OperatorErrorSignalProvider
  eventBus?: { publish: (event: { type: string; payload: unknown; at: string; projectRef?: string }) => void }
}

const DEFAULT_TIMEOUT_MS = 5000

function abortSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs)
  }
  return undefined
}

function normalizeLiveUrl(liveUrl: string): string {
  const trimmed = liveUrl.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    url.hash = ''
    url.search = ''
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
    return `${url.origin}${path}`
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

function joinUrl(base: string, path: string): string {
  const root = normalizeLiveUrl(base)
  if (!root) return path
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${root}${path.startsWith('/') ? path : `/${path}`}`
}

function isOkStatus(status: number): boolean {
  return status >= 200 && status < 400
}

async function probeLiveUrl({
  liveUrl,
  fetchImpl,
  timeoutMs,
}: {
  liveUrl: string
  fetchImpl: typeof fetch
  timeoutMs: number
}): Promise<{ ok: boolean; status?: number; method?: string; error?: string }> {
  const url = normalizeLiveUrl(liveUrl)
  if (!url) return { ok: false, error: 'missing live url' }

  let lastError = 'request failed'
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const response = await fetchImpl(url, {
        method,
        cache: 'no-store',
        redirect: 'follow',
        signal: abortSignal(timeoutMs),
      })
      if (isOkStatus(response.status)) {
        return { ok: true, status: response.status, method }
      }
      if (method === 'HEAD' && (response.status === 405 || response.status === 501)) {
        lastError = `upstream responded ${response.status}`
        continue
      }
      return { ok: false, status: response.status, method, error: `upstream responded ${response.status}` }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'request failed'
    }
  }
  return { ok: false, error: lastError }
}

function extractSeoFromHtml(html: string): {
  title?: string
  metaDescription?: string
  hasRobotsMeta?: boolean
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || undefined

  const metaDescMatch =
    html.match(
      /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    ) ||
    html.match(
      /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i,
    )
  const metaDescription = metaDescMatch?.[1]?.replace(/\s+/g, ' ').trim() || undefined

  const robotsMeta = /<meta[^>]+name=["']robots["']/i.test(html)

  return { title, metaDescription, hasRobotsMeta: robotsMeta }
}

async function probeOptionalPath({
  liveUrl,
  path,
  fetchImpl,
  timeoutMs,
}: {
  liveUrl: string
  path: string
  fetchImpl: typeof fetch
  timeoutMs: number
}): Promise<'present' | 'missing' | 'error'> {
  const url = joinUrl(liveUrl, path)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: abortSignal(timeoutMs),
    })
    if (response.status === 404 || response.status === 410) return 'missing'
    if (isOkStatus(response.status)) return 'present'
    return 'error'
  } catch {
    return 'error'
  }
}

/** Uptime probe — records reachability of the live URL. */
export async function runUptimeCheckJob(input: {
  liveUrl: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  jobId?: string
}): Promise<OsOperatorJobResult> {
  const ranAt = new Date().toISOString()
  const fetchImpl = input.fetchImpl ?? fetch
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const probe = await probeLiveUrl({ liveUrl: input.liveUrl, fetchImpl, timeoutMs })

  if (probe.ok) {
    return {
      id: input.jobId ?? createAgentStepId('uptime'),
      kind: OPERATOR_JOB_UPTIME,
      status: 'succeeded',
      ran_at: ranAt,
      summary: 'Your live site responded successfully.',
      findings: {
        ok: true,
        status_code: probe.status,
        method: probe.method,
        live_url: normalizeLiveUrl(input.liveUrl),
      },
    }
  }

  return {
    id: input.jobId ?? createAgentStepId('uptime'),
    kind: OPERATOR_JOB_UPTIME,
    status: 'failed',
    ran_at: ranAt,
    summary: "We couldn't reach your live site just now. We'll keep watching.",
    findings: {
      ok: false,
      status_code: probe.status,
      method: probe.method,
      live_url: normalizeLiveUrl(input.liveUrl),
    },
    suggestions: [
      {
        id: 'fix_uptime',
        title: 'Check site availability',
        message: 'Your live URL did not respond. Confirm the site is online and try Launch again if needed.',
      },
    ],
  }
}

/** SEO basics — title, meta description, robots.txt, sitemap. */
export async function runSeoBasicsJob(input: {
  liveUrl: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  jobId?: string
}): Promise<OsOperatorJobResult> {
  const ranAt = new Date().toISOString()
  const fetchImpl = input.fetchImpl ?? fetch
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const homeUrl = normalizeLiveUrl(input.liveUrl)
  const suggestions: OsOperatorSuggestion[] = []

  let title: string | undefined
  let metaDescription: string | undefined
  let hasRobotsMeta = false
  let homepageFetched = false

  try {
    const response = await fetchImpl(homeUrl || input.liveUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: abortSignal(timeoutMs),
    })
    if (isOkStatus(response.status)) {
      homepageFetched = true
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('html') || contentType.includes('text') || !contentType) {
        const html = await response.text()
        const seo = extractSeoFromHtml(html)
        title = seo.title
        metaDescription = seo.metaDescription
        hasRobotsMeta = Boolean(seo.hasRobotsMeta)
      }
    }
  } catch {
    // continue with path probes
  }

  const robots = await probeOptionalPath({
    liveUrl: input.liveUrl,
    path: '/robots.txt',
    fetchImpl,
    timeoutMs,
  })
  const sitemap = await probeOptionalPath({
    liveUrl: input.liveUrl,
    path: '/sitemap.xml',
    fetchImpl,
    timeoutMs,
  })

  if (!title) {
    suggestions.push({
      id: 'add_page_title',
      title: 'Add a page title',
      message: 'Add a clear <title> so search and browser tabs describe your business.',
    })
  }
  if (!metaDescription) {
    suggestions.push({
      id: 'add_meta_description',
      title: 'Add a meta description',
      message: 'Add a short meta description to improve how your site appears in search.',
    })
  }
  if (robots === 'missing') {
    suggestions.push({
      id: 'add_robots_txt',
      title: 'Add robots.txt',
      message: 'Publish a robots.txt so crawlers know what to index.',
    })
  }
  if (sitemap === 'missing') {
    suggestions.push({
      id: 'add_sitemap',
      title: 'Add a sitemap',
      message: 'Add a sitemap.xml to help search engines discover your pages.',
    })
  }

  const findings = {
    homepage_fetched: homepageFetched,
    title: title ?? null,
    meta_description: metaDescription ?? null,
    robots_meta: hasRobotsMeta,
    robots_txt: robots,
    sitemap_xml: sitemap,
  }

  const missingCount = suggestions.length
  const summary =
    missingCount === 0
      ? 'SEO basics look in place (title, meta, robots, sitemap).'
      : `SEO check finished with ${missingCount} suggestion${missingCount === 1 ? '' : 's'}.`

  return {
    id: input.jobId ?? createAgentStepId('seo'),
    kind: OPERATOR_JOB_SEO,
    status: homepageFetched || robots === 'present' || sitemap === 'present' ? 'succeeded' : 'failed',
    ran_at: ranAt,
    summary,
    findings,
    suggestions: suggestions.length ? suggestions : undefined,
  }
}

/**
 * Error / analytics signal placeholder.
 * Wire `errorSignalProvider` (Sentry, PostHog, etc.) without changing the job shape.
 */
export async function runErrorSignalsJob(input: {
  workspaceRef: string
  liveUrl: string
  provider?: OperatorErrorSignalProvider
  jobId?: string
}): Promise<OsOperatorJobResult> {
  const ranAt = new Date().toISOString()

  if (input.provider) {
    try {
      const custom = await input.provider({
        workspaceRef: input.workspaceRef,
        liveUrl: input.liveUrl,
      })
      if (custom) {
        return {
          id: input.jobId ?? createAgentStepId('errors'),
          kind: OPERATOR_JOB_ERROR_SIGNALS,
          status: custom.status ?? 'succeeded',
          ran_at: ranAt,
          summary: custom.summary ?? 'Error signals collected.',
          findings: custom.findings,
          suggestions: custom.suggestions,
        }
      }
    } catch {
      return {
        id: input.jobId ?? createAgentStepId('errors'),
        kind: OPERATOR_JOB_ERROR_SIGNALS,
        status: 'failed',
        ran_at: ranAt,
        summary: 'Error signal provider could not run. Monitoring continues.',
        findings: {
          extension_point: 'OperatorErrorSignalProvider',
          connected: true,
          error: true,
        },
      }
    }
  }

  return {
    id: input.jobId ?? createAgentStepId('errors'),
    kind: OPERATOR_JOB_ERROR_SIGNALS,
    status: 'skipped',
    ran_at: ranAt,
    summary: 'Error signal hooks are ready but not connected yet.',
    findings: {
      extension_point: 'OperatorErrorSignalProvider',
      connected: false,
      /** Future providers — do not implement here. */
      planned_providers: ['sentry', 'analytics'],
    },
    suggestions: [
      {
        id: 'watch_errors',
        title: 'Watch errors',
        message: 'Keep an eye on site errors and failed requests as visitors arrive.',
      },
    ],
  }
}

const workforcePlanner: AgentPlanner = (input) => ({
  runId: input.run.id,
  goal: input.goal ?? input.run.goal ?? 'operator workforce pass',
  steps: OPERATOR_WORKFORCE_JOB_KINDS.map((kind) => ({
    id: createAgentStepId(kind.replace(/^operator\./, '')),
    kind,
    input: input.context,
    status: 'pending' as const,
  })),
})

type JobContext = {
  workspaceRef: string
  liveUrl: string
  fetchImpl: typeof fetch
  timeoutMs: number
  errorSignalProvider?: OperatorErrorSignalProvider
}

function createWorkforceExecutor(deps: {
  onResult: (job: OsOperatorJobResult) => void
}): AgentExecutor {
  return async ({ step, run }) => {
    const ctx = (step.input ?? {}) as JobContext
    const liveUrl = ctx.liveUrl ?? ''
    const workspaceRef = ctx.workspaceRef ?? run.projectRef ?? ''
    const fetchImpl = ctx.fetchImpl ?? fetch
    const timeoutMs = ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS

    let job: OsOperatorJobResult
    switch (step.kind) {
      case OPERATOR_JOB_UPTIME:
        job = await runUptimeCheckJob({ liveUrl, fetchImpl, timeoutMs, jobId: step.id })
        break
      case OPERATOR_JOB_SEO:
        job = await runSeoBasicsJob({ liveUrl, fetchImpl, timeoutMs, jobId: step.id })
        break
      case OPERATOR_JOB_ERROR_SIGNALS:
        job = await runErrorSignalsJob({
          workspaceRef,
          liveUrl,
          provider: ctx.errorSignalProvider,
          jobId: step.id,
        })
        break
      default:
        job = {
          id: step.id,
          kind: step.kind,
          status: 'skipped',
          ran_at: new Date().toISOString(),
          summary: `Unknown operator job skipped: ${step.kind}`,
        }
    }

    deps.onResult(job)

    const finished: AgentStep = {
      ...step,
      status: job.status === 'failed' ? 'failed' : job.status === 'skipped' ? 'skipped' : 'succeeded',
      output: job,
      error: job.status === 'failed' ? job.summary : undefined,
    }
    return finished
  }
}

/**
 * In-process Operator workforce — uses agent-runtime planner/executor.
 * Soft by design: callers must catch and never fail an already-live Launch.
 */
export class OperatorWorkforce {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly errorSignalProvider?: OperatorErrorSignalProvider
  private readonly eventBus?: OperatorWorkforceOptions['eventBus']

  constructor(options: OperatorWorkforceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.errorSignalProvider = options.errorSignalProvider
    this.eventBus = options.eventBus
  }

  /**
   * Run the three Operate jobs once for a live workspace.
   */
  async runPass(input: {
    workspaceRef: string
    liveUrl: string
    sessionId?: string
  }): Promise<OperatorWorkforceRunResult> {
    const jobs: OsOperatorJobResult[] = []
    const runtime = createAgentRuntime({
      planner: workforcePlanner,
      executor: createWorkforceExecutor({ onResult: (j) => jobs.push(j) }),
      eventBus: (this.eventBus as never) ?? undefined,
      platform: Platform,
    })

    const context: JobContext = {
      workspaceRef: input.workspaceRef,
      liveUrl: input.liveUrl,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      errorSignalProvider: this.errorSignalProvider,
    }

    const run = runtime.beginRun({
      projectRef: input.workspaceRef,
      goal: 'operator workforce pass',
      correlationId: input.sessionId,
    })

    const plan = await runtime.plan({ run, goal: run.goal, context })
    for (const step of plan.steps) {
      await runtime.executeStep({ run, plan, step: { ...step, input: context } })
    }

    const anyFailed = jobs.some((j) => j.status === 'failed')
    runtime.finishRun(run.id, {
      status: anyFailed ? 'failed' : 'succeeded',
      error: anyFailed ? 'One or more operator jobs reported a failure.' : undefined,
    })

    const suggestions = mergeJobSuggestions(jobs)
    const lastRunAt = new Date().toISOString()

    this.emitJobsCompleted({
      workspaceRef: input.workspaceRef,
      sessionId: input.sessionId,
      runId: run.id,
      lastRunAt,
      jobs,
    })

    return {
      runId: run.id,
      lastRunAt,
      jobs,
      suggestions,
    }
  }

  private emitJobsCompleted(payload: {
    workspaceRef: string
    sessionId?: string
    runId: string
    lastRunAt: string
    jobs: OsOperatorJobResult[]
  }) {
    const bus = this.eventBus ?? Platform.events
    if (!bus || typeof bus.publish !== 'function') return
    try {
      bus.publish({
        type: 'OperatorJobsCompleted',
        payload: {
          sessionId: payload.sessionId,
          runId: payload.runId,
          jobIds: payload.jobs.map((j) => j.kind),
          statuses: payload.jobs.map((j) => ({ kind: j.kind, status: j.status })),
          lastRunAt: payload.lastRunAt,
        },
        at: payload.lastRunAt,
        projectRef: payload.workspaceRef,
      })
    } catch {
      // Event bus must never break Operate.
    }
  }
}

export function mergeJobSuggestions(jobs: OsOperatorJobResult[]): OsOperatorSuggestion[] {
  const byId = new Map<string, OsOperatorSuggestion>()
  for (const job of jobs) {
    for (const suggestion of job.suggestions ?? []) {
      if (!byId.has(suggestion.id)) byId.set(suggestion.id, suggestion)
    }
  }
  // Stable baseline when jobs produced nothing actionable.
  if (byId.size === 0) {
    byId.set('watch_conversions', {
      id: 'watch_conversions',
      title: 'Watch conversions',
      message: 'Track sign-ups, checkouts, and key actions once traffic starts.',
    })
  }
  return [...byId.values()]
}

/** Factory helper for Studio ports / tests. */
export function createOperatorWorkforce(options?: OperatorWorkforceOptions): OperatorWorkforce {
  return new OperatorWorkforce(options)
}
