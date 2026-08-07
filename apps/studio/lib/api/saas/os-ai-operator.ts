/**
 * AI Operator — Indobase OS Operate loop (workforce slice).
 *
 * After Launch marks a business live, the OS starts an operator session,
 * runs an in-process job pass via `@indobase/agent-runtime` (uptime / SEO /
 * error-signal placeholder), and persists results on `auth_config.os_operator`.
 *
 * Soft-fail: Launch must remain live even if operator persist or jobs fail.
 *
 * Deferred workforce (not in this slice): email answering, campaigns,
 * inventory, invoicing, continuous background workers.
 */

import { Platform } from '@indobase/platform'

import { ensureSaasTables } from './platform'
import {
  createOperatorWorkforce,
  type OperatorWorkforce,
  type OperatorWorkforceOptions,
  type OsOperatorJobResult,
  type OsOperatorSuggestion,
} from './os-operator-workforce'
import { executeQuery } from './query'

/** Phase label — keep in sync with docs/INDOBASE-OS.md Operate section. */
export const OS_AI_OPERATOR_PHASE = 'workforce' as const

export type OsOperatorStatus = 'monitoring' | 'paused' | 'stopped'

export type { OsOperatorSuggestion, OsOperatorJobResult }

export type OsOperatorSession = {
  session_id: string
  workspace_ref: string
  live_url: string
  status: OsOperatorStatus
  phase: typeof OS_AI_OPERATOR_PHASE
  started_at: string
  updated_at: string
  /** ISO timestamp of the last workforce job pass. */
  last_run_at?: string | null
  /** Job results from the latest pass (uptime / seo / error_signals). */
  jobs?: OsOperatorJobResult[]
  next_suggestions: OsOperatorSuggestion[]
  /** Last verify summary ids when available. */
  last_verify?: {
    passed?: boolean
    verified_at?: string
    failure_ids?: string[]
  } | null
  /** agent-runtime run id for the latest pass (when available). */
  last_run_id?: string | null
}

export type StartOperatorInput = {
  workspaceRef: string
  liveUrl: string
  /** Optional gotrue id — when set, membership is enforced on write. */
  gotrueId?: string
  /** Optional verify summary to stamp on the session. */
  lastVerify?: {
    passed: boolean
    verifiedAt: string
    failureIds?: string[]
  }
  /** Injectable event bus (tests). Defaults to Platform.events. */
  eventBus?: { publish: (event: { type: string; payload: unknown; at: string; projectRef?: string }) => void }
  /** Skip DB persist (unit tests that only need the session shape). */
  persist?: boolean
  /** Skip workforce job pass (tests that only need session scaffolding). */
  runJobs?: boolean
  /** Injectable workforce (tests). */
  workforce?: OperatorWorkforce
  /** Options when constructing the default workforce. */
  workforceOptions?: OperatorWorkforceOptions
}

export type StartOperatorResult = {
  ok: boolean
  session: OsOperatorSession
  message: string
}

export type GetOperatorStatusResult = {
  ok: boolean
  session: OsOperatorSession | null
  message: string
}

const FALLBACK_SUGGESTIONS: OsOperatorSuggestion[] = [
  {
    id: 'watch_errors',
    title: 'Watch errors',
    message: 'Keep an eye on site errors and failed requests as visitors arrive.',
  },
  {
    id: 'watch_conversions',
    title: 'Watch conversions',
    message: 'Track sign-ups, checkouts, and key actions once traffic starts.',
  },
  {
    id: 'improve_seo',
    title: 'Improve SEO',
    message: 'Add or refresh titles, meta descriptions, and a sitemap when ready.',
  },
]

function newSessionId(workspaceRef: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `ops_${workspaceRef}_${rand}`
}

/**
 * Default Operate suggestions before a workforce pass completes.
 */
export function defaultOperatorSuggestions(): OsOperatorSuggestion[] {
  return FALLBACK_SUGGESTIONS.map((s) => ({ ...s }))
}

function buildBaseSession(input: StartOperatorInput): OsOperatorSession {
  const now = new Date().toISOString()
  return {
    session_id: newSessionId(input.workspaceRef),
    workspace_ref: input.workspaceRef,
    live_url: input.liveUrl.trim(),
    status: 'monitoring',
    phase: OS_AI_OPERATOR_PHASE,
    started_at: now,
    updated_at: now,
    last_run_at: null,
    jobs: [],
    next_suggestions: defaultOperatorSuggestions(),
    last_run_id: null,
    last_verify: input.lastVerify
      ? {
          passed: input.lastVerify.passed,
          verified_at: input.lastVerify.verifiedAt,
          failure_ids: input.lastVerify.failureIds ?? [],
        }
      : null,
  }
}

async function persistOperatorSession({
  workspaceRef,
  gotrueId,
  session,
}: {
  workspaceRef: string
  gotrueId?: string
  session: OsOperatorSession
}): Promise<void> {
  await ensureSaasTables()

  if (gotrueId) {
    const result = await executeQuery({
      query: `
        update saas.projects p
        set auth_config = coalesce(p.auth_config, '{}'::jsonb) || jsonb_build_object('os_operator', $2::jsonb)
        where p.ref = $1
          and exists (
            select 1 from saas.organization_members m
            where m.organization_id = p.organization_id and m.gotrue_id = $3
          )
      `,
      parameters: [workspaceRef, JSON.stringify(session), gotrueId],
      actorId: gotrueId,
    })
    if (result.error) throw result.error
    return
  }

  const result = await executeQuery({
    query: `
      update saas.projects
      set auth_config = coalesce(auth_config, '{}'::jsonb) || jsonb_build_object('os_operator', $2::jsonb)
      where ref = $1
    `,
    parameters: [workspaceRef, JSON.stringify(session)],
  })
  if (result.error) throw result.error
}

function emitOperatorStarted({
  session,
  eventBus,
}: {
  session: OsOperatorSession
  eventBus?: StartOperatorInput['eventBus']
}) {
  const bus = eventBus ?? Platform.events
  if (!bus || typeof bus.publish !== 'function') return
  try {
    bus.publish({
      type: 'OperatorStarted',
      payload: {
        sessionId: session.session_id,
        liveUrl: session.live_url,
        status: session.status,
        phase: session.phase,
        suggestions: session.next_suggestions.map((s) => s.id),
        jobKinds: (session.jobs ?? []).map((j) => j.kind),
        lastRunAt: session.last_run_at ?? null,
      },
      at: session.started_at,
      projectRef: session.workspace_ref,
    })
  } catch {
    // Event bus must never break Operate start.
  }
}

async function runWorkforcePass({
  session,
  input,
}: {
  session: OsOperatorSession
  input: StartOperatorInput
}): Promise<OsOperatorSession> {
  if (input.runJobs === false) return session

  try {
    const workforce =
      input.workforce ??
      createOperatorWorkforce({
        ...(input.workforceOptions ?? {}),
        eventBus: input.eventBus ?? input.workforceOptions?.eventBus,
      })

    const pass = await workforce.runPass({
      workspaceRef: input.workspaceRef,
      liveUrl: input.liveUrl,
      sessionId: session.session_id,
    })

    const now = new Date().toISOString()
    return {
      ...session,
      updated_at: now,
      last_run_at: pass.lastRunAt,
      last_run_id: pass.runId,
      jobs: pass.jobs,
      next_suggestions:
        pass.suggestions.length > 0 ? pass.suggestions : defaultOperatorSuggestions(),
    }
  } catch (error) {
    console.warn(
      '[os-ai-operator] workforce pass failed for %s: %s',
      input.workspaceRef,
      error instanceof Error ? error.message : String(error),
    )
    // Soft-fail: keep monitoring session without job results.
    return {
      ...session,
      updated_at: new Date().toISOString(),
      next_suggestions: defaultOperatorSuggestions(),
    }
  }
}

/**
 * Start (or restart) the AI Operator workforce for a live workspace.
 * Runs uptime / SEO / error-signal jobs in-process, records `auth_config.os_operator`,
 * and emits `OperatorStarted` (+ `OperatorJobsCompleted` from the workforce).
 */
export async function startOperator(input: StartOperatorInput): Promise<StartOperatorResult> {
  let session = buildBaseSession(input)
  session = await runWorkforcePass({ session, input })

  const shouldPersist = input.persist !== false

  if (shouldPersist) {
    try {
      await persistOperatorSession({
        workspaceRef: input.workspaceRef,
        gotrueId: input.gotrueId,
        session,
      })
    } catch (error) {
      console.warn(
        '[os-ai-operator] persist failed for %s: %s',
        input.workspaceRef,
        error instanceof Error ? error.message : String(error),
      )
      emitOperatorStarted({ session, eventBus: input.eventBus })
      return {
        ok: false,
        session,
        message:
          'Operator monitoring is ready in this session, but we could not save it yet. You can continue — we will retry later.',
      }
    }
  }

  emitOperatorStarted({ session, eventBus: input.eventBus })

  const jobCount = session.jobs?.length ?? 0
  return {
    ok: true,
    session,
    message:
      jobCount > 0
        ? `Operator is monitoring your business. Ran ${jobCount} checks (uptime, SEO, error signals).`
        : 'Operator is monitoring your business. Workforce checks will retry shortly.',
  }
}

/**
 * Read operator status from auth_config.
 */
export async function getOperatorStatus(workspaceRef: string): Promise<GetOperatorStatusResult> {
  try {
    await ensureSaasTables()
    const result = await executeQuery<{ auth_config: Record<string, unknown> | null }>({
      query: `
        select coalesce(auth_config, '{}'::jsonb) as auth_config
        from saas.projects
        where ref = $1
        limit 1
      `,
      parameters: [workspaceRef],
    })
    if (result.error || !result.data?.length) {
      return {
        ok: false,
        session: null,
        message: 'Workspace not found.',
      }
    }
    const authConfig = result.data[0].auth_config
    const raw = authConfig && typeof authConfig === 'object' ? authConfig.os_operator : null
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        ok: true,
        session: null,
        message: 'No operator session yet. Launch your business to start monitoring.',
      }
    }
    const session = raw as OsOperatorSession
    return {
      ok: true,
      session,
      message:
        session.status === 'monitoring'
          ? session.last_run_at
            ? 'Operator is monitoring — latest workforce pass is on record.'
            : 'Operator is monitoring.'
          : 'Operator session found.',
    }
  } catch (error) {
    console.warn(
      '[os-ai-operator] status read failed for %s: %s',
      workspaceRef,
      error instanceof Error ? error.message : String(error),
    )
    return {
      ok: false,
      session: null,
      message: 'We could not load operator status right now. Please try again.',
    }
  }
}

/**
 * Best-effort post-publish Operate hook: verify live URL, start operator, stamp verify on session.
 * Never throws into the queued resume path — MarkLive already succeeded.
 * Hard verify failures stamp os_publish.verify_failed but do not roll back hosting.
 */
export async function runPostPublishOperateHook({
  workspaceRef,
  liveUrl,
  gotrueId,
  ensuredCapabilities,
  strictVerify,
  verify,
  start,
}: {
  workspaceRef: string
  liveUrl: string
  gotrueId?: string
  ensuredCapabilities?: string[]
  /** Override homepage hard gate; default resolves from os_publish.kind / env. */
  strictVerify?: boolean
  /** Injectable for tests. */
  verify?: (opts: {
    liveUrl: string
    ensuredCapabilities?: string[]
    strictVerify?: boolean
  }) => Promise<{
    passed: boolean
    verifiedAt: string
    failures: Array<{ id: string; message?: string }>
    warnings?: Array<{ id: string }>
    checks: unknown[]
    strictVerify?: boolean
  }>
  start?: typeof startOperator
}): Promise<{
  verify: Awaited<ReturnType<NonNullable<typeof verify>>> | null
  operator: StartOperatorResult | null
}> {
  let verifyResult: Awaited<ReturnType<NonNullable<typeof verify>>> | null = null

  try {
    if (verify) {
      verifyResult = await verify({ liveUrl, ensuredCapabilities, strictVerify })
    } else {
      const { verifyOsLaunch, resolveStrictVerify } = await import('./os-launch-verify')
      let publishKind: string | null = null
      try {
        await ensureSaasTables()
        const row = await executeQuery<{ auth_config: Record<string, unknown> | null }>({
          query: `
            select coalesce(auth_config, '{}'::jsonb) as auth_config
            from saas.projects
            where ref = $1
            limit 1
          `,
          parameters: [workspaceRef],
        })
        const authConfig = row.data?.[0]?.auth_config
        const osPublish =
          authConfig && typeof authConfig === 'object' ? authConfig.os_publish : null
        if (osPublish && typeof osPublish === 'object' && !Array.isArray(osPublish)) {
          const kind = (osPublish as { kind?: unknown }).kind
          publishKind = typeof kind === 'string' ? kind : null
        }
      } catch {
        publishKind = null
      }
      const resolvedStrict = resolveStrictVerify({
        explicit: strictVerify,
        publishKind,
      })
      verifyResult = await verifyOsLaunch({
        liveUrl,
        ensuredCapabilities,
        strictVerify: resolvedStrict,
      })
    }
  } catch (error) {
    console.warn(
      '[os-ai-operator] verify failed for %s: %s',
      workspaceRef,
      error instanceof Error ? error.message : String(error),
    )
  }

  let operator: StartOperatorResult | null = null
  try {
    const startFn = start ?? startOperator
    operator = await startFn({
      workspaceRef,
      liveUrl,
      gotrueId,
      lastVerify: verifyResult
        ? {
            passed: verifyResult.passed,
            verifiedAt: verifyResult.verifiedAt,
            failureIds: verifyResult.failures.map((f) => f.id),
          }
        : undefined,
    })
  } catch (error) {
    console.warn(
      '[os-ai-operator] start failed for %s: %s',
      workspaceRef,
      error instanceof Error ? error.message : String(error),
    )
  }

  // Best-effort: stamp verify summary. Hard failures overlay verify_failed (no teardown).
  if (verifyResult) {
    try {
      const { summarizeOsLaunchVerify } = await import('./os-launch-verify')
      if ('checks' in verifyResult && Array.isArray(verifyResult.checks)) {
        await ensureSaasTables()
        const summary = summarizeOsLaunchVerify(verifyResult as never)
        if (!verifyResult.passed) {
          const message =
            verifyResult.failures[0] && typeof verifyResult.failures[0].message === 'string'
              ? verifyResult.failures[0].message
              : "We couldn't confirm your business is responding yet."
          const patch = {
            publish_status: 'verify_failed',
            verify_failed_at: new Date().toISOString(),
            verify_failed_message: message,
            os_launch_verify: summary,
          }
          if (gotrueId) {
            await executeQuery({
              query: `
                update saas.projects p
                set auth_config =
                  coalesce(p.auth_config, '{}'::jsonb)
                  || jsonb_build_object(
                    'os_publish',
                    coalesce(p.auth_config->'os_publish', '{}'::jsonb) || $2::jsonb,
                    'os_launch_verify',
                    $3::jsonb
                  )
                where p.ref = $1
                  and exists (
                    select 1 from saas.organization_members m
                    where m.organization_id = p.organization_id and m.gotrue_id = $4
                  )
              `,
              parameters: [workspaceRef, JSON.stringify(patch), JSON.stringify(summary), gotrueId],
              actorId: gotrueId,
            })
          } else {
            await executeQuery({
              query: `
                update saas.projects
                set auth_config =
                  coalesce(auth_config, '{}'::jsonb)
                  || jsonb_build_object(
                    'os_publish',
                    coalesce(auth_config->'os_publish', '{}'::jsonb) || $2::jsonb,
                    'os_launch_verify',
                    $3::jsonb
                  )
                where ref = $1
              `,
              parameters: [workspaceRef, JSON.stringify(patch), JSON.stringify(summary)],
            })
          }
        } else if (gotrueId) {
          await executeQuery({
            query: `
              update saas.projects p
              set auth_config = coalesce(p.auth_config, '{}'::jsonb) || jsonb_build_object('os_launch_verify', $2::jsonb)
              where p.ref = $1
                and exists (
                  select 1 from saas.organization_members m
                  where m.organization_id = p.organization_id and m.gotrue_id = $3
                )
            `,
            parameters: [workspaceRef, JSON.stringify(summary), gotrueId],
            actorId: gotrueId,
          })
        } else {
          await executeQuery({
            query: `
              update saas.projects
              set auth_config = coalesce(auth_config, '{}'::jsonb) || jsonb_build_object('os_launch_verify', $2::jsonb)
              where ref = $1
            `,
            parameters: [workspaceRef, JSON.stringify(summary)],
          })
        }
      }
    } catch {
      // ignore — verify already ran in-memory
    }
  }

  return { verify: verifyResult, operator }
}
